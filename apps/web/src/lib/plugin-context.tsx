/**
 * Frontend Plugin Context Factory
 *
 * Creates a FrontendPluginContext object that delegates all registerXxx
 * calls to the plugin store's registration methods. This binds the pluginId
 * so plugins don't need to pass it on every call.
 *
 * Used when activating a plugin's frontend via `activateFrontend(context)`.
 */

import type {
  FrontendPluginContext,
  Disposable,
  PluginLogger,
  PluginContext,
  SettingsCategoryRegistration,
  SettingsSectionRegistration,
  SessionStatusRendererRegistration,
  UsagePanelRegistration,
  TerminalHeaderActionRegistration,
  ActionBarItemRegistration,
  MoreMenuItemRegistration,
  ThemeRegistration,
  ChangelogSourceRegistration,
} from '@omniscribe/plugin-api';
import { lazy, Suspense } from 'react';
import { ChangelogEvents, createLogger } from '@omniscribe/shared';
import { Newspaper } from 'lucide-react';
import { emitAsync } from '@/lib/socket';
import type { usePluginStore as UsePluginStoreType } from '@/stores/usePluginStore';

/**
 * Lazy ChangelogSection. Settings → Updates is the only path that
 * mounts this; loading react-markdown + plugins eagerly via the plugin
 * activation pipeline was the single biggest contributor to the
 * renderer entry chunk (~140 KB gzip).
 */
const LazyChangelogSection = lazy(() =>
  import('@/components/changelog/ChangelogSection').then(m => ({ default: m.ChangelogSection }))
);

/**
 * Dispose all subscriptions in a plugin context.
 * Called during frontend plugin deactivation to clean up resources.
 */
export function disposeFrontendPluginContext(context: PluginContext): void {
  for (const disposable of context.subscriptions) {
    try {
      disposable.dispose();
    } catch {
      // Swallow disposal errors
    }
  }
  context.subscriptions.length = 0;
}

/**
 * Create a FrontendPluginContext for a plugin.
 *
 * The returned context object implements the FrontendPluginContext interface
 * from @omniscribe/plugin-api. Each registerXxx method delegates to the
 * corresponding method on the plugin store, binding the pluginId automatically.
 *
 * @param pluginId - The unique ID of the plugin being activated
 * @param store - The usePluginStore Zustand store
 * @returns A fully-typed FrontendPluginContext
 */
export function createFrontendPluginContext(
  pluginId: string,
  store: typeof UsePluginStoreType
): FrontendPluginContext {
  const logger = createLogger(`Plugin:${pluginId}`) as PluginLogger;
  const subscriptions: Disposable[] = [];

  return {
    pluginId,
    logger,
    subscriptions,

    registerSettingsCategory(reg: SettingsCategoryRegistration): Disposable {
      return store.getState().registerSettingsCategory(pluginId, reg);
    },

    registerSettingsSection(reg: SettingsSectionRegistration): Disposable {
      return store.getState().registerSettingsSection(pluginId, reg);
    },

    registerSessionStatusRenderer(reg: SessionStatusRendererRegistration): Disposable {
      return store.getState().registerStatusRenderer(pluginId, reg);
    },

    registerUsagePanel(reg: UsagePanelRegistration): Disposable {
      return store.getState().registerUsagePanel(pluginId, reg);
    },

    registerTerminalHeaderAction(reg: TerminalHeaderActionRegistration): Disposable {
      return store.getState().registerTerminalHeaderAction(pluginId, reg);
    },

    registerActionBarItem(reg: ActionBarItemRegistration): Disposable {
      return store.getState().registerActionBarItem(pluginId, reg);
    },

    registerMoreMenuItem(reg: MoreMenuItemRegistration): Disposable {
      return store.getState().registerMoreMenuItem(pluginId, reg);
    },

    registerTheme(reg: ThemeRegistration): Disposable {
      return store.getState().registerTheme(pluginId, reg);
    },

    registerChangelogSource(reg: ChangelogSourceRegistration): Disposable {
      // Auto-register a settings section under the plugin's category. The
      // bare changelog source registration AND the synthesised section are
      // bundled into one composite Disposable so deactivating the plugin
      // tears both down atomically.
      const Icon = reg.icon ?? Newspaper;
      const inferredCategory =
        reg.categoryId ?? (pluginId.replace(/^provider-/, '') || 'integrations');
      const sectionId = `changelog:${reg.id}`;
      const label = reg.label;
      const viewUrl = reg.source.viewUrl;

      const SectionComponent = () => (
        <Suspense
          fallback={<div className="h-3 w-1/3 animate-pulse rounded bg-muted/40" aria-hidden />}
        >
          <LazyChangelogSection sourceId={reg.id} label={label} icon={Icon} viewUrl={viewUrl} />
        </Suspense>
      );

      const sourceDisposable = store.getState().registerChangelogSource(pluginId, reg);

      const sectionDisposable = store.getState().registerSettingsSection(pluginId, {
        categoryId: inferredCategory,
        sectionId,
        label: 'Changelog',
        icon: Icon,
        component: SectionComponent,
        order: reg.order ?? 50,
      });

      // Push the source declaration over the wire so the backend can
      // dispatch fetches. Function-shaped fields (e.g. a 'custom' fetcher
      // implementation) are intentionally not transmitted — those live in
      // ProviderPluginContext.registerCustomChangelogFetcher instead.
      void emitAsync<
        {
          id: string;
          source: ChangelogSourceRegistration['source'];
          cacheTtlMs?: number;
          viewUrl?: string;
        },
        { success: boolean; message?: string }
      >(ChangelogEvents.REGISTER_SOURCE, {
        id: reg.id,
        source: reg.source,
        cacheTtlMs: reg.cacheTtlMs,
        viewUrl: reg.source.viewUrl,
      }).catch(err => {
        logger.warn('Failed to register changelog source with backend', err);
      });

      return {
        dispose: () => {
          sectionDisposable.dispose();
          sourceDisposable.dispose();
          void emitAsync<{ id: string }, { success: boolean }>(ChangelogEvents.UNREGISTER_SOURCE, {
            id: reg.id,
          }).catch(err => {
            logger.warn('Failed to unregister changelog source with backend', err);
          });
        },
      };
    },
  };
}
