/**
 * Backend port singleton.
 *
 * Stores the OS-assigned port that NestJS is listening on.
 * Separate file to avoid circular imports between index.ts, window.ts, and ipc/app.ts.
 */

let _port: number | null = null;

export function getBackendPort(): number {
  if (_port === null) {
    throw new Error('Backend port not set yet');
  }
  return _port;
}

export function setBackendPort(port: number): void {
  if (_port !== null) {
    throw new Error('Backend port already set');
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid backend port: ${port}`);
  }
  _port = port;
}
