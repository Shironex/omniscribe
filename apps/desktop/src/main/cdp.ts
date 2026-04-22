/**
 * Chrome DevTools Protocol (CDP) helpers for the Electron main process.
 *
 * Omniscribe's own CDP is "dogfood mode" only — it lets you drive the
 * running Omniscribe window from `@playwright/mcp --cdp-endpoint` while
 * developing Omniscribe itself. It is OFF by default so we don't squat
 * on port 9222, which the user may want to use for their own Electron
 * apps running inside Omniscribe sessions.
 *
 * Opt in via `OMNISCRIBE_ENABLE_CDP=1`. Override the port with
 * `OMNISCRIBE_CDP_PORT`. The switch itself is applied by the caller via
 * `app.commandLine.appendSwitch('remote-debugging-port', ...)`. This
 * module is intentionally electron-free so it can be unit-tested in
 * plain Jest.
 */

export const CDP_DEFAULT_PORT = 9222;

// Parse OMNISCRIBE_CDP_PORT and fall back to the default if it is missing,
// NaN, non-integer, or out of the valid TCP port range. Invalid values
// would otherwise propagate to `remote-debugging-port` as the literal
// string "NaN" and silently disable Chromium's devtools endpoint.
function parseCdpPort(raw: string | undefined): number {
  if (!raw) return CDP_DEFAULT_PORT;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return CDP_DEFAULT_PORT;
  }
  return parsed;
}

export const CDP_PORT = parseCdpPort(process.env.OMNISCRIBE_CDP_PORT);

/**
 * Env-override-only check. Returns true only when the user explicitly
 * opts in via `OMNISCRIBE_ENABLE_CDP=1`.
 */
export function isCdpEnabled(): boolean {
  return process.env.OMNISCRIBE_ENABLE_CDP === '1';
}

/**
 * Runtime check — CDP for Omniscribe itself is opt-in only via the env
 * override. `isPackaged` is accepted for API compatibility with callers
 * that pass `app.isPackaged`, but no longer participates in the decision.
 */
export function cdpEnabledForRuntime(_isPackaged: boolean): boolean {
  return process.env.OMNISCRIBE_ENABLE_CDP === '1';
}
