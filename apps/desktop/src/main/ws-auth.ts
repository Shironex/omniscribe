/**
 * Per-window WebSocket authentication token.
 *
 * A 256-bit random token is generated at app start, exposed to the
 * renderer through a dedicated IPC handler, and required on every
 * Socket.io handshake (see CustomIoAdapter.allowRequest).
 *
 * Threat model: any local process can connect to the dynamic backend
 * port; CORS only constrains web-origin browsers. The token closes
 * that gap — only the renderer (which obtains it through the
 * contextBridge) can complete a WS handshake.
 *
 * The token is intentionally NOT persisted: it lives in memory, dies
 * with the process, and is regenerated on the next launch.
 */
import { randomBytes, timingSafeEqual } from 'crypto';

let _token: string | null = null;

/**
 * Initialize the auth token. Idempotent — repeated calls return the
 * same value so tests and re-init paths cannot rotate it mid-flight.
 */
export function initializeWsAuthToken(): string {
  if (_token === null) {
    _token = randomBytes(32).toString('hex');
  }
  return _token;
}

/**
 * Get the auth token. Throws if `initializeWsAuthToken()` has not run.
 */
export function getWsAuthToken(): string {
  if (_token === null) {
    throw new Error('WS auth token not initialized');
  }
  return _token;
}

/**
 * Constant-time comparison for the auth token. Returns false on any
 * mismatch including length differences — `timingSafeEqual` rejects
 * unequal-length buffers.
 */
export function isValidWsAuthToken(candidate: unknown): boolean {
  if (typeof candidate !== 'string' || _token === null) return false;
  // hex strings → ASCII Buffer; lengths must match before timingSafeEqual.
  if (candidate.length !== _token.length) return false;
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(_token, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Reset the token store. Test-only.
 */
export function __resetWsAuthTokenForTests(): void {
  _token = null;
}
