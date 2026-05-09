import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
import { isValidWsAuthToken } from '../../main/ws-auth';
import { isOriginAllowed } from './cors.config';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('CustomIoAdapter');

/**
 * Extract the candidate auth token from a Socket.io handshake request.
 *
 * Socket.io exposes the `auth` payload via the `_query.auth` field for
 * polling transports and via a header for websocket upgrades. We accept
 * either the standard query field or an explicit `x-omniscribe-token`
 * header so non-browser clients can still auth.
 */
function extractToken(req: {
  _query?: Record<string, string | undefined>;
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const fromQuery = req._query?.auth;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;

  const header = req.headers?.['x-omniscribe-token'];
  if (typeof header === 'string') return header;
  if (Array.isArray(header) && typeof header[0] === 'string') return header[0];

  return undefined;
}

/**
 * Custom Socket.io adapter with Connection State Recovery (CSR) and
 * per-window auth token enforcement.
 *
 * Two layers:
 * 1. CORS origin check — rejects unrelated web apps via the same allowlist
 *    used for HTTP CORS. Browsers can't forge their `Origin` header.
 * 2. Auth-token check — every handshake must carry the per-process token
 *    that lives only inside the renderer's contextBridge. Other local
 *    processes have no way to acquire it.
 *
 * @see https://socket.io/docs/v4/connection-state-recovery
 */
export class CustomIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: Partial<ServerOptions>) {
    return super.createIOServer(port, {
      ...options,
      connectionStateRecovery: {
        maxDisconnectionDuration: 30_000,
        skipMiddlewares: true,
      },
      allowRequest: (
        req: {
          _query?: Record<string, string | undefined>;
          headers?: Record<string, string | string[] | undefined>;
        },
        callback: (err: string | null | undefined, success: boolean) => void
      ) => {
        const headerOrigin = req.headers?.origin;
        const origin = typeof headerOrigin === 'string' ? headerOrigin : undefined;
        if (!isOriginAllowed(origin)) {
          logger.warn(`Rejected handshake — disallowed origin: ${origin ?? '<none>'}`);
          callback('Forbidden origin', false);
          return;
        }

        const token = extractToken(req);
        if (!isValidWsAuthToken(token)) {
          logger.warn('Rejected handshake — missing or invalid auth token');
          callback('Unauthorized', false);
          return;
        }

        callback(null, true);
      },
    });
  }
}
