import { useEffect, useRef } from 'react';
import { createLogger } from '@omniscribe/shared';
import { usePluginStore } from '@/stores/usePluginStore';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { createFrontendPluginContext } from '@/lib/plugin-context';

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
};

/**
 * Hook that initializes plugin socket listeners and activates frontend
 * plugins once the backend reports provider status.
 *
 * Called from useAppInitialization to wire into the app boot sequence.
 */
export function usePluginInitialization(): void {
  const initRef = useRef(false);
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

  // Activate frontend plugins when providers are loaded from backend
  useEffect(() => {
    if (providers.length === 0) return;

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
            mod.frontendActivate(context);
            usePluginStore.getState().activateFrontendPlugin(provider.id);
            logger.info(`Frontend activated: ${provider.displayName}`);
          }
        })
        .catch(err => {
          logger.error(`Failed to activate frontend for ${provider.id}:`, err);
        });
    }
  }, [providers, frontendPluginsActivated]);
}
