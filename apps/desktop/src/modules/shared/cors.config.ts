/**
 * Shared CORS configuration
 *
 * Security: Restricts connections to the exact set of origins Electron
 * uses for Omniscribe's renderer. Previous versions allowed ANY localhost
 * port via a regex, which let any other local web app cross-talk to the
 * backend.
 */

import { VITE_DEV_PORT } from '@omniscribe/shared';

/**
 * Allowed origins for CORS.
 *
 * In production the renderer loads via the `file://` protocol (and some
 * Electron builds use `app://`). In dev the renderer is served by Vite on
 * a fixed port — `localhost:15174` / `127.0.0.1:15174`. Anything else
 * (including arbitrary localhost ports from unrelated local web apps) is
 * rejected.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  `http://localhost:${VITE_DEV_PORT}`,
  `http://127.0.0.1:${VITE_DEV_PORT}`,
];

/**
 * Origin prefixes for protocols where the host portion is opaque.
 * `file://` and `app://` URLs may carry arbitrary path-like suffixes that
 * we do not need to gate on.
 */
const ALLOWED_ORIGIN_PREFIXES = ['app://', 'file://'] as const;

/**
 * CORS configuration for WebSocket gateways.
 *
 * Note: Socket.io accepts callback-style `origin` here; we delegate to
 * `corsOriginCallback` so the same allowlist drives both HTTP and WS.
 */
export const CORS_CONFIG = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) =>
    corsOriginCallback(origin, callback),
  credentials: true,
} as const;

/**
 * Check if an origin is allowed.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    // No-origin requests are same-origin or Electron-internal — allowed.
    return true;
  }

  if (ALLOWED_ORIGINS.includes(origin)) return true;

  return ALLOWED_ORIGIN_PREFIXES.some(prefix => origin.startsWith(prefix));
}

/**
 * CORS origin callback for NestJS HTTP CORS
 * Usage: nestApp.enableCors({ origin: corsOriginCallback, credentials: true })
 */
export function corsOriginCallback(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
): void {
  if (isOriginAllowed(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
}
