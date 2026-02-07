import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

/**
 * Custom Socket.io adapter with Connection State Recovery (CSR) enabled.
 *
 * CSR allows the server to temporarily buffer events and restore room
 * memberships for clients that disconnect and reconnect within the
 * maxDisconnectionDuration window. This means short network blips are
 * transparent to the user -- no manual re-fetch or room rejoin needed.
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
    });
  }
}
