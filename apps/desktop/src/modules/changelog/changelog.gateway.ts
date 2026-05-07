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
import { ChangelogService } from './changelog.service';
import { ChangelogRegistryService } from './changelog-registry.service';
import { ChangelogEvents, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type {
  ChangelogFetchPayload,
  ChangelogRefreshPayload,
  ChangelogResponse,
} from '@omniscribe/shared';
import type { ChangelogSourceKind } from '@omniscribe/plugin-api';
import { CORS_CONFIG } from '../shared/cors.config';

interface RegisterSourcePayload {
  id: string;
  source: ChangelogSourceKind;
  cacheTtlMs?: number;
  viewUrl?: string;
}

interface UnregisterSourcePayload {
  id: string;
}

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class ChangelogGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = createLogger('ChangelogGateway');

  constructor(
    private readonly service: ChangelogService,
    private readonly registry: ChangelogRegistryService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /** Lazy fetch — respects the cache TTL unless `forceRefresh` is set. */
  @SkipThrottle()
  @SubscribeMessage(ChangelogEvents.FETCH)
  async handleFetch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: ChangelogFetchPayload
  ): Promise<ChangelogResponse> {
    if (!payload?.sourceId || typeof payload.sourceId !== 'string') {
      const message = 'changelog:fetch missing sourceId';
      this.logger.warn(message);
      return { error: 'unknown', message };
    }
    const forceRefresh = payload.forceRefresh ?? false;
    this.logger.debug(
      `[changelog:fetch] sourceId=${payload.sourceId} forceRefresh=${forceRefresh}`
    );
    try {
      return await this.service.fetchChangelog(payload.sourceId, forceRefresh);
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error(`Fetch failed for "${payload.sourceId}": ${message}`);
      return { error: 'unknown', message };
    }
  }

  /** Force-refresh helper — equivalent to `fetch` with `forceRefresh: true`. */
  @SkipThrottle()
  @SubscribeMessage(ChangelogEvents.REFRESH)
  async handleRefresh(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: ChangelogRefreshPayload
  ): Promise<ChangelogResponse> {
    if (!payload?.sourceId || typeof payload.sourceId !== 'string') {
      const message = 'changelog:refresh missing sourceId';
      this.logger.warn(message);
      return { error: 'unknown', message };
    }
    this.logger.debug(`[changelog:refresh] sourceId=${payload.sourceId}`);
    try {
      return await this.service.fetchChangelog(payload.sourceId, true);
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error(`Refresh failed for "${payload.sourceId}": ${message}`);
      return { error: 'unknown', message };
    }
  }

  /**
   * Renderer → backend: declare a changelog source so the backend can
   * dispatch fetches for it. Function-shaped fields (e.g. custom-kind
   * fetcher impls) can't cross the wire — those live in
   * `ProviderPluginContext.registerCustomChangelogFetcher`.
   */
  @SubscribeMessage(ChangelogEvents.REGISTER_SOURCE)
  handleRegisterSource(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: RegisterSourcePayload
  ): { success: boolean; message?: string } {
    if (!payload?.id || typeof payload.id !== 'string') {
      return { success: false, message: 'missing id' };
    }
    if (!payload.source || typeof payload.source !== 'object') {
      return { success: false, message: 'missing source' };
    }
    this.registry.register({
      id: payload.id,
      source: payload.source,
      cacheTtlMs: payload.cacheTtlMs,
      viewUrl: payload.viewUrl,
    });
    return { success: true };
  }

  /** Renderer → backend: drop a previously declared source. */
  @SubscribeMessage(ChangelogEvents.UNREGISTER_SOURCE)
  handleUnregisterSource(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: UnregisterSourcePayload
  ): { success: boolean } {
    if (!payload?.id || typeof payload.id !== 'string') {
      return { success: false };
    }
    this.registry.unregister(payload.id);
    return { success: true };
  }
}
