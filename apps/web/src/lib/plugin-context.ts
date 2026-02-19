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
  SettingsCategoryRegistration,
  SettingsSectionRegistration,
  SessionStatusRendererRegistration,
  UsagePanelRegistration,
  TerminalHeaderActionRegistration,
  ActionBarItemRegistration,
  MoreMenuItemRegistration,
  ThemeRegistration,
} from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';
import type { usePluginStore as UsePluginStoreType } from '@/stores/usePluginStore';

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
  const logger = createLogger(`Plugin:${pluginId}`) as unknown as PluginLogger;
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
  };
}
