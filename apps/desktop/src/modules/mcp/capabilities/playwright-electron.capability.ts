import * as net from 'net';
import type { CapabilityBuildContext, McpCapability } from './capability.types';

/** Default CDP port when ctx.electronCdpPort is not populated. */
const DEFAULT_PORT = 9222;

/** TCP probe timeout in ms for the preflight connection check. */
const PROBE_TIMEOUT_MS = 200;

/**
 * Quick TCP probe — returns true if something accepts a connection on
 * 127.0.0.1:<port> within the timeout, false otherwise. Used by the
 * preflight to tell the user whether their Electron app is listening.
 */
function probePort(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/**
 * Playwright (Electron) capability.
 *
 * Attaches `@playwright/mcp` to a CDP endpoint on 127.0.0.1 so the AI
 * can drive the user's OWN Electron app (launched with
 * `--remote-debugging-port=<port>`). The port is per-project and
 * configurable in Settings → AI Capabilities.
 *
 * Omniscribe used to squat on port 9222 in dev; that's been moved behind
 * `OMNISCRIBE_ENABLE_CDP=1` (dogfood mode) so the default port is free
 * for the user's own apps.
 */
export const playwrightElectronCapability: McpCapability = {
  id: 'playwright-electron',
  label: 'Playwright (Electron)',
  description:
    'Lets the AI drive your own Electron app over CDP. Launch your app with --remote-debugging-port=<port>.',
  defaultEnabled: false,
  async preflight(ctx: CapabilityBuildContext) {
    const port = ctx.electronCdpPort ?? DEFAULT_PORT;
    const listening = await probePort(port);
    if (!listening) {
      return {
        ok: false,
        reason: `No Electron app listening on port ${port}. Launch yours with --remote-debugging-port=${port}.`,
      };
    }
    return { ok: true };
  },
  async buildConfig(ctx: CapabilityBuildContext) {
    const port = ctx.electronCdpPort ?? DEFAULT_PORT;
    return {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--cdp-endpoint', `http://127.0.0.1:${port}`],
    };
  },
};
