import { useEffect, useRef } from 'react';
import type { FrontendPluginContext } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';
import { usePluginStore } from '@/stores/usePluginStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { createFrontendPluginContext, disposeFrontendPluginContext } from '@/lib/plugin-context';

const logger = createLogger('PluginInit');

/**
 * Bundled plugin frontend modules (static map).
 * Each entry maps a plugin ID to a lazy loader that resolves to a module
 * with a `frontendActivate(ctx)` function.
 *
 * When new plugins are added, add an entry here. The Vite alias
 * `@omniscribe/provider-claude/frontend` resolves to the plugin's frontend barrel.
 */
const BUNDLED_FRONTEND_ACTIVATORS: Record<
  string,
  () => Promise<{ frontendActivate: (ctx: any) => void }>
> = {
  'provider-claude': () => import('@omniscribe/provider-claude/frontend'),
  'provider-codex': () => import('@omniscribe/provider-codex/frontend'),
};

/**
 * Hook that initializes plugin socket listeners and activates frontend
 * plugins once the backend reports provider status.
 *
 * Called from useAppInitialization to wire into the app boot sequence.
 */
export function usePluginInitialization(): void {
  const initRef = useRef(false);
  const contextsRef = useRef(new Map<string, FrontendPluginContext>());
  const connectionStatus = useConnectionStore(s => s.status);
  const providers = usePluginStore(s => s.providers);
  const frontendPluginsActivated = usePluginStore(s => s.frontendPluginsActivated);

  // Initialize plugin socket listeners once connected
  useEffect(() => {
    if (connectionStatus === 'connected' && !initRef.current) {
      initRef.current = true;
      usePluginStore.getState().initSocketListeners();
    }
  }, [connectionStatus]);

  // Activate/deactivate frontend plugins based on provider state
  useEffect(() => {
    if (providers.length === 0) return;

    // Activate plugins that should be active
    for (const provider of providers) {
      if (!provider.enabled || !provider.activated) continue;
      if (frontendPluginsActivated.has(provider.id)) continue;

      const activator = BUNDLED_FRONTEND_ACTIVATORS[provider.id];
      if (!activator) continue;

      // Dynamically import and activate this plugin's frontend
      activator()
        .then(mod => {
          if (mod.frontendActivate) {
            const context = createFrontendPluginContext(provider.id, usePluginStore);
            contextsRef.current.set(provider.id, context);
            mod.frontendActivate(context);
            usePluginStore.getState().activateFrontendPlugin(provider.id);
            logger.info(`Frontend activated: ${provider.displayName}`);
          }
        })
        .catch(err => {
          logger.error(`Failed to activate frontend for ${provider.id}:`, err);
        });
    }

    // Deactivate plugins that are no longer active
    for (const pluginId of frontendPluginsActivated) {
      const provider = providers.find(p => p.id === pluginId);
      if (provider && provider.enabled && provider.activated) continue;

      // Dispose context subscriptions
      const context = contextsRef.current.get(pluginId);
      if (context) {
        disposeFrontendPluginContext(context);
        contextsRef.current.delete(pluginId);
      }
      usePluginStore.getState().deactivateFrontendPlugin(pluginId);
      logger.info(`Frontend deactivated: ${pluginId}`);
    }
  }, [providers, frontendPluginsActivated]);
}
