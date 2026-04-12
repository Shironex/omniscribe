import type { McpCapability } from './capability.types';
import type { CdpInfoService } from '../services/cdp-info.service';

/**
 * Playwright (Electron) capability.
 *
 * Attaches `@playwright/mcp` to the running Electron window's CDP endpoint,
 * letting the AI drive Omniscribe itself for self-testing. Only available
 * when CDP is enabled on the main process — see
 * `apps/desktop/src/main/cdp.ts`.
 */
export function createPlaywrightElectronCapability(cdp: CdpInfoService): McpCapability {
  return {
    id: 'playwright-electron',
    label: 'Playwright (Electron)',
    description:
      'Lets the AI drive the running Omniscribe Electron window over CDP for self-testing.',
    defaultEnabled: false,
    requiresDev: true,
    preflight: async () => {
      if (!cdp.isEnabled()) {
        return {
          ok: false,
          reason: 'CDP not enabled — run in dev or set OMNISCRIBE_ENABLE_CDP=1',
        };
      }
      return { ok: true };
    },
    buildConfig: async () => ({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--cdp-endpoint', cdp.getEndpoint()],
    }),
  };
}
