import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  SettingsCategoryRegistration,
  SettingsSectionRegistration,
  SessionStatusRendererRegistration,
  UsagePanelRegistration,
  TerminalHeaderActionRegistration,
  ActionBarItemRegistration,
  MoreMenuItemRegistration,
  ThemeRegistration,
  Disposable,
  CliDetectionResult,
} from '@omniscribe/plugin-api';
import { ALL_THEMES, PluginEvents, createLogger } from '@omniscribe/shared';
import { getSocket, emitAsync } from '@/lib/socket';
import { injectThemeStyles, removeThemeStyles } from '@/lib/plugin-theme-injector';
import type { NavigationGroup, NavigationItem } from '@/components/settings/navigation-config';

const logger = createLogger('PluginStore');

// ==========================================
// Provider Info (mirrors backend ProviderInfo)
// ==========================================

/**
 * Serializable provider info from the backend.
 * Matches the `ProviderInfo` type in `apps/desktop/src/modules/plugin/types.ts`.
 */
export interface ProviderInfo {
  id: string;
  displayName: string;
  description: string;
  aiMode: string;
  icon?: string;
  enabled: boolean;
  activated: boolean;
  cliStatus: CliDetectionResult;
}

// ==========================================
// Registration entry types (registration + pluginId)
// ==========================================

type WithPluginId<T> = T & { pluginId: string };

// ==========================================
// Store state
// ==========================================

interface PluginStoreState {
  /** Provider info from backend (via WebSocket) */
  providers: ProviderInfo[];

  /** Settings category registrations keyed by `${pluginId}:${reg.categoryId}` */
  settingsCategories: Map<string, WithPluginId<SettingsCategoryRegistration>>;

  /** Settings section registrations keyed by `${pluginId}:${reg.sectionId}` */
  settingsSections: Map<string, WithPluginId<SettingsSectionRegistration>>;

  /** Status renderer registrations keyed by `${pluginId}:${reg.id}` */
  statusRenderers: Map<string, WithPluginId<SessionStatusRendererRegistration>>;

  /** Usage panel registrations keyed by `${pluginId}:${reg.id}` */
  usagePanels: Map<string, WithPluginId<UsagePanelRegistration>>;

  /** Terminal header action registrations keyed by `${pluginId}:${reg.id}` */
  terminalHeaderActions: Map<string, WithPluginId<TerminalHeaderActionRegistration>>;

  /** Action bar item registrations keyed by `${pluginId}:${reg.id}` */
  actionBarItems: Map<string, WithPluginId<ActionBarItemRegistration>>;

  /** More menu item registrations keyed by `${pluginId}:${reg.id}` */
  moreMenuItems: Map<string, WithPluginId<MoreMenuItemRegistration>>;

  /** Theme registrations keyed by `${pluginId}:${reg.id}` */
  themes: Map<string, WithPluginId<ThemeRegistration>>;

  /** Tracks which plugins have had activateFrontend() called */
  frontendPluginsActivated: Set<string>;

  /** Socket listeners setup flag */
  listenersInitialized: boolean;
}

// ==========================================
// Store actions
// ==========================================

interface PluginStoreActions {
  /** Replace providers array */
  setProviders: (providers: ProviderInfo[]) => void;

  /** Emit WebSocket `plugin:set-enabled` event, optimistic UI update */
  setProviderEnabled: (aiMode: string, enabled: boolean) => void;

  /** Add to activated set */
  activateFrontendPlugin: (pluginId: string) => void;

  /** Remove from activated set, dispose all registrations for pluginId */
  deactivateFrontendPlugin: (pluginId: string) => void;

  /** Registration methods (each returns Disposable) */
  registerSettingsCategory: (pluginId: string, reg: SettingsCategoryRegistration) => Disposable;
  registerSettingsSection: (pluginId: string, reg: SettingsSectionRegistration) => Disposable;
  registerStatusRenderer: (pluginId: string, reg: SessionStatusRendererRegistration) => Disposable;
  registerUsagePanel: (pluginId: string, reg: UsagePanelRegistration) => Disposable;
  registerTerminalHeaderAction: (
    pluginId: string,
    reg: TerminalHeaderActionRegistration
  ) => Disposable;
  registerActionBarItem: (pluginId: string, reg: ActionBarItemRegistration) => Disposable;
  registerMoreMenuItem: (pluginId: string, reg: MoreMenuItemRegistration) => Disposable;
  registerTheme: (pluginId: string, reg: ThemeRegistration) => Disposable;

  /** Set up socket listeners for plugin events */
  initSocketListeners: () => void;
}

// ==========================================
// Combined store type
// ==========================================

type PluginStore = PluginStoreState & PluginStoreActions;

// ==========================================
// Helpers
// ==========================================

/** Built-in theme IDs for collision detection */
const BUILTIN_THEME_IDS = new Set(ALL_THEMES.map(String));

/**
 * Check if a `showFor` field matches a given aiMode.
 * Matches if showFor is '*', equals the aiMode, or is an array containing '*' or the aiMode.
 */
function matchesShowFor(showFor: string | string[], aiMode?: string): boolean {
  if (!aiMode) return true;
  if (showFor === '*') return true;
  if (typeof showFor === 'string') return showFor === aiMode;
  return showFor.includes('*') || showFor.includes(aiMode);
}

// ==========================================
// Store
// ==========================================

export const usePluginStore = create<PluginStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      providers: [],
      settingsCategories: new Map(),
      settingsSections: new Map(),
      statusRenderers: new Map(),
      usagePanels: new Map(),
      terminalHeaderActions: new Map(),
      actionBarItems: new Map(),
      moreMenuItems: new Map(),
      themes: new Map(),
      frontendPluginsActivated: new Set(),
      listenersInitialized: false,

      // ==========================================
      // Provider actions
      // ==========================================

      setProviders: (providers: ProviderInfo[]) => {
        logger.debug('setProviders', providers.length, 'providers');
        set({ providers }, undefined, 'plugin/setProviders');
      },

      setProviderEnabled: (aiMode: string, enabled: boolean) => {
        logger.info('setProviderEnabled', aiMode, enabled);

        // Optimistic UI update (also clear activated when disabling)
        set(
          state => ({
            providers: state.providers.map(p =>
              p.aiMode === aiMode ? { ...p, enabled, ...(enabled ? {} : { activated: false }) } : p
            ),
          }),
          undefined,
          'plugin/setProviderEnabled'
        );

        // Emit to backend
        emitAsync<{ aiMode: string; enabled: boolean }, { success: boolean }>(
          PluginEvents.SET_ENABLED,
          { aiMode, enabled }
        ).catch(err => {
          logger.error('Failed to set provider enabled', err);
          // Rollback on failure
          set(
            state => ({
              providers: state.providers.map(p =>
                p.aiMode === aiMode ? { ...p, enabled: !enabled } : p
              ),
            }),
            undefined,
            'plugin/setProviderEnabled:rollback'
          );
        });
      },

      // ==========================================
      // Frontend plugin lifecycle
      // ==========================================

      activateFrontendPlugin: (pluginId: string) => {
        logger.info('activateFrontendPlugin', pluginId);
        set(
          state => {
            const next = new Set(state.frontendPluginsActivated);
            next.add(pluginId);
            return { frontendPluginsActivated: next };
          },
          undefined,
          'plugin/activateFrontendPlugin'
        );
      },

      deactivateFrontendPlugin: (pluginId: string) => {
        logger.info('deactivateFrontendPlugin', pluginId);

        // Remove theme CSS from DOM before removing from store
        const currentThemes = get().themes;
        for (const [, theme] of currentThemes) {
          if (theme.pluginId === pluginId) {
            removeThemeStyles(theme.id);
          }
        }

        set(
          state => {
            // Remove from activated set
            const nextActivated = new Set(state.frontendPluginsActivated);
            nextActivated.delete(pluginId);

            // Remove all registrations for this plugin
            const removeForPlugin = <T extends { pluginId: string }>(
              map: Map<string, T>
            ): Map<string, T> => {
              const next = new Map<string, T>();
              for (const [key, value] of map) {
                if (value.pluginId !== pluginId) {
                  next.set(key, value);
                }
              }
              return next;
            };

            return {
              frontendPluginsActivated: nextActivated,
              settingsCategories: removeForPlugin(state.settingsCategories),
              settingsSections: removeForPlugin(state.settingsSections),
              statusRenderers: removeForPlugin(state.statusRenderers),
              usagePanels: removeForPlugin(state.usagePanels),
              terminalHeaderActions: removeForPlugin(state.terminalHeaderActions),
              actionBarItems: removeForPlugin(state.actionBarItems),
              moreMenuItems: removeForPlugin(state.moreMenuItems),
              themes: removeForPlugin(state.themes),
            };
          },
          undefined,
          'plugin/deactivateFrontendPlugin'
        );
      },

      // ==========================================
      // Registration methods
      // ==========================================

      registerSettingsCategory: (
        pluginId: string,
        reg: SettingsCategoryRegistration
      ): Disposable => {
        const key = `${pluginId}:${reg.categoryId}`;
        logger.debug('registerSettingsCategory', key);

        set(
          state => {
            const next = new Map(state.settingsCategories);
            next.set(key, { ...reg, pluginId });
            return { settingsCategories: next };
          },
          undefined,
          'plugin/registerSettingsCategory'
        );

        // Also register each section within the category
        const sectionDisposables: Disposable[] = [];
        for (const section of reg.sections) {
          sectionDisposables.push(get().registerSettingsSection(pluginId, section));
        }

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.settingsCategories);
                next.delete(key);
                return { settingsCategories: next };
              },
              undefined,
              'plugin/unregisterSettingsCategory'
            );
            // Also dispose all sections
            for (const d of sectionDisposables) {
              d.dispose();
            }
          },
        };
      },

      registerSettingsSection: (pluginId: string, reg: SettingsSectionRegistration): Disposable => {
        const key = `${pluginId}:${reg.sectionId}`;
        logger.debug('registerSettingsSection', key);

        set(
          state => {
            const next = new Map(state.settingsSections);
            next.set(key, { ...reg, pluginId });
            return { settingsSections: next };
          },
          undefined,
          'plugin/registerSettingsSection'
        );

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.settingsSections);
                next.delete(key);
                return { settingsSections: next };
              },
              undefined,
              'plugin/unregisterSettingsSection'
            );
          },
        };
      },

      registerStatusRenderer: (
        pluginId: string,
        reg: SessionStatusRendererRegistration
      ): Disposable => {
        const key = `${pluginId}:${reg.id}`;
        logger.debug('registerStatusRenderer', key);

        set(
          state => {
            const next = new Map(state.statusRenderers);
            next.set(key, { ...reg, pluginId });
            return { statusRenderers: next };
          },
          undefined,
          'plugin/registerStatusRenderer'
        );

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.statusRenderers);
                next.delete(key);
                return { statusRenderers: next };
              },
              undefined,
              'plugin/unregisterStatusRenderer'
            );
          },
        };
      },

      registerUsagePanel: (pluginId: string, reg: UsagePanelRegistration): Disposable => {
        const key = `${pluginId}:${reg.id}`;
        logger.debug('registerUsagePanel', key);

        set(
          state => {
            const next = new Map(state.usagePanels);
            next.set(key, { ...reg, pluginId });
            return { usagePanels: next };
          },
          undefined,
          'plugin/registerUsagePanel'
        );

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.usagePanels);
                next.delete(key);
                return { usagePanels: next };
              },
              undefined,
              'plugin/unregisterUsagePanel'
            );
          },
        };
      },

      registerTerminalHeaderAction: (
        pluginId: string,
        reg: TerminalHeaderActionRegistration
      ): Disposable => {
        const key = `${pluginId}:${reg.id}`;
        logger.debug('registerTerminalHeaderAction', key);

        set(
          state => {
            const next = new Map(state.terminalHeaderActions);
            next.set(key, { ...reg, pluginId });
            return { terminalHeaderActions: next };
          },
          undefined,
          'plugin/registerTerminalHeaderAction'
        );

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.terminalHeaderActions);
                next.delete(key);
                return { terminalHeaderActions: next };
              },
              undefined,
              'plugin/unregisterTerminalHeaderAction'
            );
          },
        };
      },

      registerActionBarItem: (pluginId: string, reg: ActionBarItemRegistration): Disposable => {
        const key = `${pluginId}:${reg.id}`;
        logger.debug('registerActionBarItem', key);

        set(
          state => {
            const next = new Map(state.actionBarItems);
            next.set(key, { ...reg, pluginId });
            return { actionBarItems: next };
          },
          undefined,
          'plugin/registerActionBarItem'
        );

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.actionBarItems);
                next.delete(key);
                return { actionBarItems: next };
              },
              undefined,
              'plugin/unregisterActionBarItem'
            );
          },
        };
      },

      registerMoreMenuItem: (pluginId: string, reg: MoreMenuItemRegistration): Disposable => {
        const key = `${pluginId}:${reg.id}`;
        logger.debug('registerMoreMenuItem', key);

        set(
          state => {
            const next = new Map(state.moreMenuItems);
            next.set(key, { ...reg, pluginId });
            return { moreMenuItems: next };
          },
          undefined,
          'plugin/registerMoreMenuItem'
        );

        return {
          dispose: () => {
            set(
              state => {
                const next = new Map(state.moreMenuItems);
                next.delete(key);
                return { moreMenuItems: next };
              },
              undefined,
              'plugin/unregisterMoreMenuItem'
            );
          },
        };
      },

      registerTheme: (pluginId: string, reg: ThemeRegistration): Disposable => {
        const key = `${pluginId}:${reg.id}`;

        // Validate theme ID doesn't collide with built-in themes
        if (BUILTIN_THEME_IDS.has(reg.id)) {
          logger.warn(
            `Theme ID "${reg.id}" from plugin "${pluginId}" collides with a built-in theme. Registration skipped.`
          );
          return { dispose: () => {} };
        }

        logger.debug('registerTheme', key);

        set(
          state => {
            const next = new Map(state.themes);
            next.set(key, { ...reg, pluginId });
            return { themes: next };
          },
          undefined,
          'plugin/registerTheme'
        );

        // Inject CSS custom properties into the DOM
        injectThemeStyles(reg.id, reg.cssProperties);

        return {
          dispose: () => {
            // Remove CSS from DOM before removing from store
            removeThemeStyles(reg.id);
            set(
              state => {
                const next = new Map(state.themes);
                next.delete(key);
                return { themes: next };
              },
              undefined,
              'plugin/unregisterTheme'
            );
          },
        };
      },

      // ==========================================
      // Socket listeners
      // ==========================================

      initSocketListeners: () => {
        if (get().listenersInitialized) return;

        logger.info('Initializing plugin socket listeners');
        const socket = getSocket();

        // Listen for provider status updates (full list broadcast)
        socket.on(
          PluginEvents.PROVIDER_STATUS,
          (data: { providers: ProviderInfo[] } | ProviderInfo[]) => {
            const list = Array.isArray(data) ? data : data.providers;
            logger.debug('Received provider status', list.length, 'providers');
            get().setProviders(list);
          }
        );

        // Listen for individual provider enabled change
        socket.on(PluginEvents.PROVIDER_ENABLED, (data: { aiMode: string; enabled: boolean }) => {
          logger.debug('Received provider enabled', data.aiMode, data.enabled);
          set(
            state => ({
              providers: state.providers.map(p =>
                p.aiMode === data.aiMode
                  ? {
                      ...p,
                      enabled: data.enabled,
                      ...(data.enabled ? {} : { activated: false }),
                    }
                  : p
              ),
            }),
            undefined,
            'plugin/providerEnabled'
          );
        });

        // Listen for provider errors
        socket.on(PluginEvents.PROVIDER_ERROR, (data: { pluginId: string; error: string }) => {
          logger.error('Provider error', data.pluginId, data.error);
        });

        set({ listenersInitialized: true }, undefined, 'plugin/listenersInitialized');

        // Fetch initial provider list
        emitAsync<Record<string, never>, { providers: ProviderInfo[] } | ProviderInfo[]>(
          PluginEvents.LIST_PROVIDERS,
          {}
        )
          .then(data => {
            const list = Array.isArray(data) ? data : data.providers;
            get().setProviders(list);
          })
          .catch(err => {
            logger.error('Failed to fetch initial providers', err);
          });
      },
    }),
    { name: 'plugin' }
  )
);

// ==========================================
// Exported selectors
// ==========================================

/**
 * Get merged settings navigation: core nav groups + plugin-registered categories/sections.
 * Plugin categories are inserted based on their `order` field.
 */
export function getSettingsNavigation(): NavigationGroup[] {
  const state = usePluginStore.getState();

  // Collect plugin categories with their sections
  const pluginGroups: Array<NavigationGroup & { order: number }> = [];

  for (const [, cat] of state.settingsCategories) {
    // Find all sections for this category
    const sections: Array<WithPluginId<SettingsSectionRegistration>> = [];
    for (const [, section] of state.settingsSections) {
      if (section.categoryId === cat.categoryId) {
        sections.push(section);
      }
    }

    // Sort sections by order
    sections.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

    const items: NavigationItem[] = sections.map(s => ({
      id: s.sectionId,
      label: s.label,
      icon: s.icon as NavigationItem['icon'],
    }));

    if (items.length > 0) {
      pluginGroups.push({
        label: cat.label,
        items,
        order: cat.order ?? 100,
      });
    }
  }

  // Sort plugin groups by order
  pluginGroups.sort((a, b) => a.order - b.order);

  return pluginGroups;
}

/**
 * Get the status renderer for a given AI mode.
 * Returns undefined if no renderer is registered for the mode.
 */
export function getStatusRenderer(
  aiMode: string
): WithPluginId<SessionStatusRendererRegistration> | undefined {
  const state = usePluginStore.getState();
  const matches: WithPluginId<SessionStatusRendererRegistration>[] = [];

  for (const [, reg] of state.statusRenderers) {
    if (reg.aiMode === aiMode) {
      matches.push(reg);
    }
  }

  if (matches.length === 0) return undefined;

  // Return highest priority (lowest order)
  matches.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matches[0];
}

/**
 * Get the usage panel for a given AI mode.
 * Returns undefined if no panel is registered for the mode.
 */
export function getUsagePanel(aiMode: string): WithPluginId<UsagePanelRegistration> | undefined {
  const state = usePluginStore.getState();
  const matches: WithPluginId<UsagePanelRegistration>[] = [];

  for (const [, reg] of state.usagePanels) {
    if (reg.aiMode === aiMode) {
      matches.push(reg);
    }
  }

  if (matches.length === 0) return undefined;

  // Return highest priority (lowest order)
  matches.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matches[0];
}

/**
 * Get terminal header actions for a given AI mode.
 * Matches by aiMode or wildcard '*' in showFor.
 */
export function getTerminalHeaderActions(
  aiMode?: string
): WithPluginId<TerminalHeaderActionRegistration>[] {
  const state = usePluginStore.getState();
  const matches: WithPluginId<TerminalHeaderActionRegistration>[] = [];

  for (const [, reg] of state.terminalHeaderActions) {
    if (matchesShowFor(reg.showFor, aiMode)) {
      matches.push(reg);
    }
  }

  matches.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matches;
}

/**
 * Get action bar items for a given AI mode.
 * Matches by aiMode or wildcard '*' in showFor.
 */
export function getActionBarItems(aiMode?: string): WithPluginId<ActionBarItemRegistration>[] {
  const state = usePluginStore.getState();
  const matches: WithPluginId<ActionBarItemRegistration>[] = [];

  for (const [, reg] of state.actionBarItems) {
    if (matchesShowFor(reg.showFor, aiMode)) {
      matches.push(reg);
    }
  }

  matches.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matches;
}

/**
 * Get more menu items for a given AI mode.
 * Matches by aiMode or wildcard '*' in showFor.
 */
export function getMoreMenuItems(aiMode?: string): WithPluginId<MoreMenuItemRegistration>[] {
  const state = usePluginStore.getState();
  const matches: WithPluginId<MoreMenuItemRegistration>[] = [];

  for (const [, reg] of state.moreMenuItems) {
    if (matchesShowFor(reg.showFor, aiMode)) {
      matches.push(reg);
    }
  }

  matches.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  return matches;
}

/**
 * Get all registered themes (for merging with built-in themes).
 */
export function getAllThemes(): WithPluginId<ThemeRegistration>[] {
  const state = usePluginStore.getState();
  return Array.from(state.themes.values());
}

/**
 * Get provider info for a given AI mode.
 */
export function getProviderByAiMode(aiMode: string): ProviderInfo | undefined {
  const state = usePluginStore.getState();
  return state.providers.find(p => p.aiMode === aiMode);
}
