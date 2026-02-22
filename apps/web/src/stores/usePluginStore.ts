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
} from '@omniscribe/plugin-api';
import { ALL_THEMES, PluginEvents, createLogger, type ProviderInfo } from '@omniscribe/shared';
import { emitAsync } from '@/lib/socket';
import { injectThemeStyles, removeThemeStyles, isValidThemeId } from '@/lib/plugin-theme-injector';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('PluginStore');

// Re-export ProviderInfo for consumers that import from this store
export type { ProviderInfo } from '@omniscribe/shared';

// ==========================================
// Registration entry types (registration + pluginId)
// ==========================================

type WithPluginId<T> = T & { pluginId: string };

// ==========================================
// Store state
// ==========================================

interface PluginState extends SocketStoreState {
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
}

// ==========================================
// Store actions
// ==========================================

interface PluginActions extends SocketStoreActions {
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

  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
}

// ==========================================
// Combined store type
// ==========================================

type PluginStore = PluginState & PluginActions;

// ==========================================
// Helpers
// ==========================================

/** Built-in theme IDs for collision detection */
const BUILTIN_THEME_IDS = new Set(ALL_THEMES.map(String));

/**
 * Check if a `showFor` field matches a given aiMode.
 * Matches if showFor is '*', equals the aiMode, or is an array containing '*' or the aiMode.
 */
export function matchesShowFor(showFor: string | string[], aiMode?: string): boolean {
  if (!aiMode) return true;
  if (showFor === '*') return true;
  if (typeof showFor === 'string') return showFor === aiMode;
  return showFor.includes('*') || showFor.includes(aiMode);
}

/** Registration Map property names (used for bulk cleanup in deactivateFrontendPlugin) */
const REGISTRATION_MAP_KEYS = [
  'settingsCategories',
  'settingsSections',
  'statusRenderers',
  'usagePanels',
  'terminalHeaderActions',
  'actionBarItems',
  'moreMenuItems',
  'themes',
] as const satisfies ReadonlyArray<keyof PluginState>;

/**
 * Generic factory that creates a registration method for a given Map property.
 * Produces a function `(pluginId, reg) => Disposable` that sets/deletes from
 * the named Map using a compound key, with devtools action labels.
 */
function createRegistration<T extends object>(
  set: (
    fn: (state: PluginState) => Partial<PluginState>,
    replace: undefined,
    action: string
  ) => void,
  mapKey: (typeof REGISTRATION_MAP_KEYS)[number],
  idField: keyof T & string,
  actionLabel: string
): (pluginId: string, reg: T) => Disposable {
  return (pluginId: string, reg: T): Disposable => {
    const id = (reg as Record<string, unknown>)[idField];
    if (id == null) {
      logger.warn(`Registration for ${actionLabel} is missing required field "${idField}"`);
      return { dispose: () => {} };
    }
    const key = `${pluginId}:${String(id)}`;
    logger.debug(`register${actionLabel}`, key);

    set(
      state => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const next = new Map(state[mapKey] as Map<string, any>);
        next.set(key, { ...reg, pluginId });
        // Computed property key [mapKey] loses type narrowing, so cast is needed
        return { [mapKey]: next } as unknown as Partial<PluginState>;
      },
      undefined,
      `plugin/register${actionLabel}`
    );

    return {
      dispose: () => {
        set(
          state => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const next = new Map(state[mapKey] as Map<string, any>);
            next.delete(key);
            // Computed property key [mapKey] loses type narrowing, so cast is needed
            return { [mapKey]: next } as unknown as Partial<PluginState>;
          },
          undefined,
          `plugin/unregister${actionLabel}`
        );
      },
    };
  };
}

// ==========================================
// Store
// ==========================================

export const usePluginStore = create<PluginStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<PluginState>(set, 'plugin');

      // Pre-create factory for registerSettingsCategory (avoids re-creation per call)
      const registerSettingsCategoryCore = createRegistration<SettingsCategoryRegistration>(
        set,
        'settingsCategories',
        'categoryId',
        'SettingsCategory'
      );

      // Create socket listeners with proper cleanup
      const { initListeners, cleanupListeners } = createSocketListeners<PluginStore>(
        get,
        set,
        'plugin',
        {
          listeners: [
            {
              event: PluginEvents.PROVIDER_STATUS,
              handler: (data, get) => {
                const result = data as { providers?: ProviderInfo[] };
                const providers = result?.providers ?? [];
                logger.debug('Received provider status', providers.length, 'providers');
                get().setProviders(providers);
              },
            },
            {
              event: PluginEvents.PROVIDER_ENABLED,
              handler: data => {
                const payload = data as { aiMode?: string; enabled?: boolean };
                if (typeof payload?.aiMode !== 'string' || typeof payload?.enabled !== 'boolean') {
                  logger.warn('Received malformed provider enabled payload');
                  return;
                }
                const { aiMode, enabled } = payload;
                logger.debug('Received provider enabled', aiMode, enabled);
                set(
                  state => ({
                    providers: state.providers.map(p =>
                      p.aiMode === aiMode
                        ? {
                            ...p,
                            enabled,
                            ...(enabled ? {} : { activated: false }),
                          }
                        : p
                    ),
                  }),
                  undefined,
                  'plugin/providerEnabled'
                );
              },
            },
            {
              event: PluginEvents.PROVIDER_ERROR,
              handler: data => {
                const payload = data as { pluginId?: string; error?: string };
                const pluginId = payload?.pluginId ?? 'unknown';
                const error = payload?.error ?? 'Unknown error';
                logger.error('Provider error', pluginId, error);
              },
            },
          ],
          onConnect: get => {
            // Fetch initial provider list on connect/reconnect
            emitAsync<Record<string, never>, { providers: ProviderInfo[] }>(
              PluginEvents.LIST_PROVIDERS,
              {}
            )
              .then(data => {
                const providers = (data as { providers?: ProviderInfo[] })?.providers ?? [];
                get().setProviders(providers);
              })
              .catch(err => {
                logger.error('Failed to fetch initial providers', err);
              });
          },
        }
      );

      return {
        // Initial state (spread common state + custom state)
        ...initialSocketState,
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

        // ==========================================
        // Provider actions
        // ==========================================

        setProviders: (providers: ProviderInfo[]) => {
          logger.debug('setProviders', providers.length, 'providers');
          set({ providers }, undefined, 'plugin/setProviders');
        },

        setProviderEnabled: (aiMode: string, enabled: boolean) => {
          logger.info('setProviderEnabled', aiMode, enabled);

          // Capture previous state for rollback
          const previous = get().providers.find(p => p.aiMode === aiMode);

          // Optimistic UI update (also clear activated when disabling)
          set(
            state => ({
              providers: state.providers.map(p =>
                p.aiMode === aiMode
                  ? { ...p, enabled, ...(enabled ? {} : { activated: false }) }
                  : p
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
            // Rollback on failure — restore both enabled and activated
            set(
              state => ({
                providers: state.providers.map(p =>
                  p.aiMode === aiMode && previous
                    ? { ...p, enabled: previous.enabled, activated: previous.activated }
                    : p
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

              // Remove all registrations for this plugin from every Map
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

              const cleaned: Partial<PluginState> = { frontendPluginsActivated: nextActivated };
              for (const mapKey of REGISTRATION_MAP_KEYS) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (cleaned as any)[mapKey] = removeForPlugin(state[mapKey] as Map<string, any>);
              }
              return cleaned;
            },
            undefined,
            'plugin/deactivateFrontendPlugin'
          );
        },

        // ==========================================
        // Registration methods (factory-generated)
        // ==========================================

        registerSettingsCategory: (
          pluginId: string,
          reg: SettingsCategoryRegistration
        ): Disposable => {
          // Core category registration via pre-created factory
          const categoryDisposable = registerSettingsCategoryCore(pluginId, reg);

          // Also register each section within the category
          const sectionDisposables: Disposable[] = [];
          for (const section of reg.sections) {
            sectionDisposables.push(get().registerSettingsSection(pluginId, section));
          }

          return {
            dispose: () => {
              categoryDisposable.dispose();
              for (const d of sectionDisposables) {
                d.dispose();
              }
            },
          };
        },

        registerSettingsSection: createRegistration<SettingsSectionRegistration>(
          set,
          'settingsSections',
          'sectionId',
          'SettingsSection'
        ),

        registerStatusRenderer: createRegistration<SessionStatusRendererRegistration>(
          set,
          'statusRenderers',
          'id',
          'StatusRenderer'
        ),

        registerUsagePanel: createRegistration<UsagePanelRegistration>(
          set,
          'usagePanels',
          'id',
          'UsagePanel'
        ),

        registerTerminalHeaderAction: createRegistration<TerminalHeaderActionRegistration>(
          set,
          'terminalHeaderActions',
          'id',
          'TerminalHeaderAction'
        ),

        registerActionBarItem: createRegistration<ActionBarItemRegistration>(
          set,
          'actionBarItems',
          'id',
          'ActionBarItem'
        ),

        registerMoreMenuItem: createRegistration<MoreMenuItemRegistration>(
          set,
          'moreMenuItems',
          'id',
          'MoreMenuItem'
        ),

        registerTheme: (pluginId: string, reg: ThemeRegistration): Disposable => {
          const key = `${pluginId}:${reg.id}`;

          // Validate theme ID format (prevent CSS injection)
          if (!isValidThemeId(reg.id)) {
            logger.warn(
              `Theme ID "${reg.id}" from plugin "${pluginId}" contains invalid characters. Registration skipped.`
            );
            return { dispose: () => {} };
          }

          // Validate theme ID doesn't collide with built-in themes
          if (BUILTIN_THEME_IDS.has(reg.id)) {
            logger.warn(
              `Theme ID "${reg.id}" from plugin "${pluginId}" collides with a built-in theme. Registration skipped.`
            );
            return { dispose: () => {} };
          }

          // Warn if another plugin already registered the same bare theme ID
          for (const [existingKey, existing] of get().themes) {
            if (existing.id === reg.id && existingKey !== key) {
              logger.warn(
                `Theme ID "${reg.id}" from plugin "${pluginId}" collides with the same ID already registered by plugin "${existing.pluginId}". The new registration may not be discoverable via getPluginTheme().`
              );
              break;
            }
          }

          // Inject CSS custom properties into the DOM (validates properties internally)
          const injected = injectThemeStyles(reg.id, reg.cssProperties);
          if (!injected) {
            logger.warn(
              `Theme "${reg.id}" from plugin "${pluginId}" has no valid CSS properties. Registration skipped.`
            );
            return { dispose: () => {} };
          }

          // Use factory for the core Map set/delete, then layer CSS cleanup on dispose
          const coreDisposable = createRegistration<ThemeRegistration>(
            set,
            'themes',
            'id',
            'Theme'
          )(pluginId, reg);

          return {
            dispose: () => {
              // Remove CSS from DOM before removing from store
              removeThemeStyles(reg.id);
              coreDisposable.dispose();
            },
          };
        },

        // Common socket actions + listener lifecycle
        ...socketActions,
        initListeners,
        cleanupListeners,
      };
    },
    { name: 'plugin' }
  )
);

// ==========================================
// Exported selectors (non-reactive, for use outside React)
// ==========================================

/**
 * Get a plugin theme registration by its bare theme ID (e.g. "codex-dark").
 * The themes Map is keyed by compound keys (`${pluginId}:${reg.id}`),
 * so direct `.get(themeId)` won't work — this scans values instead.
 *
 * **Non-reactive** — uses `getState()` snapshot. Use in Zustand actions
 * or one-time reads (e.g. useState initializer), not for subscriptions.
 */
export function getPluginTheme(themeId: string): WithPluginId<ThemeRegistration> | undefined {
  const state = usePluginStore.getState();
  for (const [, reg] of state.themes) {
    if (reg.id === themeId) return reg;
  }
  return undefined;
}
