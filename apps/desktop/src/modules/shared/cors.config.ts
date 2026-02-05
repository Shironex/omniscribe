/**
 * Shared CORS configuration
 *
 * Security: Restricts connections to local origins only to prevent
 * malicious websites from connecting to the local server.
 */

/** Allowed origins for CORS */
export const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'http://localhost:5173', // Vite dev server
  'http://127.0.0.1:5173',
  'http://localhost:3001', // NestJS server
  'http://127.0.0.1:3001',
  /^app:\/\//, // Electron app protocol
  /^file:\/\//, // Local file protocol
];

/**
 * CORS configuration for WebSocket gateways
 */
export const CORS_CONFIG = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
} as const;

/**
 * Check if an origin is allowed
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true; // Allow requests with no origin (same-origin, Electron, etc.)
  }

  return ALLOWED_ORIGINS.some(allowed => {
    if (allowed instanceof RegExp) {
      return allowed.test(origin);
    }
    return allowed === origin;
  });
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
