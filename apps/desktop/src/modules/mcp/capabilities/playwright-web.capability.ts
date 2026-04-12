import * as path from 'path';
import type {
  CapabilityBuildContext,
  McpCapability,
  McpWrittenServerEntry,
} from './capability.types';

/**
 * Playwright (Web) capability.
 *
 * Spawns the official `@playwright/mcp` server via `npx`, scoped to a
 * per-project user data directory under `.omniscribe/pw-profile-web`.
 *
 * No special preflight — `npx -y` will fetch on demand. Future phases
 * may add detection for the dev server or the Playwright binary.
 */
export const playwrightWebCapability: McpCapability = {
  id: 'playwright-web',
  label: 'Playwright (Web)',
  description:
    'Lets the AI drive a headless Chromium against your dev server via the official @playwright/mcp.',
  defaultEnabled: false,
  async buildConfig(ctx: CapabilityBuildContext): Promise<McpWrittenServerEntry | null> {
    return {
      type: 'stdio',
      command: 'npx',
      args: [
        '-y',
        '@playwright/mcp@latest',
        '--user-data-dir',
        path.join(ctx.workingDir, '.omniscribe', 'pw-profile-web'),
      ],
    };
  },
};
