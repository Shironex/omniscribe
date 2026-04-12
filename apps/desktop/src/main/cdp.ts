/**
 * Chrome DevTools Protocol (CDP) helpers for the Electron main process.
 *
 * We allow external tools (e.g. `@playwright/mcp --cdp-endpoint`) to attach
 * to the running Omniscribe window for self-testing. To keep the attack
 * surface minimal, CDP is only enabled when:
 *
 *   - `OMNISCRIBE_ENABLE_CDP=1` is explicitly set, OR
 *   - the app is running unpackaged in `NODE_ENV=development`.
 *
 * The switch itself is applied by the caller via
 * `app.commandLine.appendSwitch('remote-debugging-port', ...)`. This module
 * is intentionally electron-free so it can be unit-tested in plain Jest.
 */

export const CDP_DEFAULT_PORT = 9222;

export const CDP_PORT = Number(process.env.OMNISCRIBE_CDP_PORT ?? CDP_DEFAULT_PORT);

/**
 * Env-override-only check. Returns true only when the user explicitly
 * opts in via `OMNISCRIBE_ENABLE_CDP=1`.
 */
export function isCdpEnabled(): boolean {
  if (process.env.OMNISCRIBE_ENABLE_CDP === '1') return true;
  // Dev-only fallback — must use app.isPackaged check, not NODE_ENV alone.
  // Caller passes `app.isPackaged`; keep this module electron-free so it's unit-testable.
  return false;
}

/**
 * Runtime check that combines the env override with a dev-mode fallback.
 * The caller passes `app.isPackaged` so this module stays testable.
 */
export function cdpEnabledForRuntime(isPackaged: boolean): boolean {
  if (process.env.OMNISCRIBE_ENABLE_CDP === '1') return true;
  return !isPackaged && process.env.NODE_ENV === 'development';
}
