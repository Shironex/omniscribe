import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('WsThrottlerGuard');

/**
 * Custom WebSocket throttler guard for Socket.io.
 *
 * The default ThrottlerGuard assumes HTTP request/response objects.
 * This override extracts the client IP from the Socket.io handshake
 * and uses it as the tracker for rate limiting.
 */
@Injectable()
export class WsThrottlerGuard extends ThrottlerGuard {
  async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration, generateKey } = requestProps;

    const client = context.switchToWs().getClient();
    // Get client IP from the underlying socket connection
    const tracker: string =
      client._socket?.remoteAddress ?? client.handshake?.address ?? '127.0.0.1';
    const throttlerName = throttler.name ?? 'default';
    const key = generateKey(context, tracker, throttlerName);

    const { isBlocked, totalHits, timeToExpire, timeToBlockExpire } =
      await this.storageService.increment(key, ttl, limit, blockDuration, throttlerName);

    if (isBlocked) {
      const eventName = context.switchToWs().getPattern?.() ?? 'unknown';
      logger.warn(
        `Rate limit exceeded for ${tracker} on event "${eventName}" ` +
          `(${totalHits}/${limit} hits, blocked for ${timeToBlockExpire}ms)`
      );
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    return true;
  }
}
