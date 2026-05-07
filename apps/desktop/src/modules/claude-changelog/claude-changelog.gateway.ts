import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { ClaudeChangelogService } from './claude-changelog.service';
import { ClaudeChangelogEvents, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { ClaudeChangelogFetchPayload, ClaudeChangelogResponse } from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class ClaudeChangelogGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = createLogger('ClaudeChangelogGateway');

  constructor(private readonly service: ClaudeChangelogService) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /** Lazy fetch — respects the cache TTL unless `forceRefresh` is set. */
  @SkipThrottle()
  @SubscribeMessage(ClaudeChangelogEvents.FETCH)
  async handleFetch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: ClaudeChangelogFetchPayload
  ): Promise<ClaudeChangelogResponse> {
    const forceRefresh = payload?.forceRefresh ?? false;
    this.logger.debug(`[claude-changelog:fetch] forceRefresh=${forceRefresh}`);
    try {
      return await this.service.fetchChangelog(forceRefresh);
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error(`Fetch failed: ${message}`);
      return { error: 'unknown', message };
    }
  }

  /** Force-refresh helper — equivalent to `fetch` with `forceRefresh: true`. */
  @SkipThrottle()
  @SubscribeMessage(ClaudeChangelogEvents.REFRESH)
  async handleRefresh(@ConnectedSocket() _client: Socket): Promise<ClaudeChangelogResponse> {
    this.logger.debug('[claude-changelog:refresh]');
    try {
      return await this.service.fetchChangelog(true);
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error(`Refresh failed: ${message}`);
      return { error: 'unknown', message };
    }
  }
}
