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
import { UsageService } from './usage.service';
import { UsageEvents, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { UsageFetchPayload, UsageFetchResponse, ClaudeCliStatus } from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

// @UseGuards kept for consistency with other gateways and future-proofing,
// even though both handlers currently use @SkipThrottle().
@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class UsageGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = createLogger('UsageGateway');

  constructor(private readonly usageService: UsageService) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Handle usage:fetch request from client
   */
  @SkipThrottle()
  @SubscribeMessage(UsageEvents.FETCH)
  async handleFetch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: UsageFetchPayload
  ): Promise<UsageFetchResponse> {
    const aiMode = payload.aiMode ?? 'claude';
    this.logger.debug(`Fetching usage for mode=${aiMode} workingDir=${payload.workingDir}`);

    const result = await this.usageService.fetchUsageForMode(aiMode, payload.workingDir);

    if (!result) {
      return { error: 'cli_not_found', message: 'No usage provider available' };
    }

    if (result.error) {
      this.logger.warn(`Usage fetch failed: ${result.error} - ${result.message}`);
      return { error: result.error, message: result.message };
    }

    // Build response: always include providerUsage when available
    const response: UsageFetchResponse = {};

    if (result.providerUsage) {
      response.providerUsage = result.providerUsage;
    }

    // Include rawUsage (ClaudeUsage) for Claude frontend backward compatibility
    if (result.rawUsage) {
      response.usage = result.rawUsage;
      this.logger.debug(
        `Usage fetched successfully: session=${result.rawUsage.sessionPercentage}%`
      );
    }

    // If we have providerUsage or rawUsage, return them
    if (response.providerUsage || response.usage) {
      return response;
    }

    // Fallback: no usage data available
    return { error: 'parse_error', message: 'Usage data format mismatch' };
  }

  /**
   * Handle usage:claude-status request - get Claude CLI status
   */
  @SkipThrottle()
  @SubscribeMessage(UsageEvents.CLAUDE_STATUS)
  async handleStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: { refresh?: boolean }
  ): Promise<{ status: ClaudeCliStatus; error?: string }> {
    this.logger.debug(`[usage:claude-status] refresh=${payload?.refresh ?? false}`);
    try {
      const status = await this.usageService.getStatusForMode('claude', payload?.refresh);
      return { status: status as ClaudeCliStatus };
    } catch (error) {
      const message = extractErrorMessage(error);
      const platform = process.platform;
      const arch = process.arch;
      return {
        status: {
          installed: false,
          platform,
          arch,
          auth: { authenticated: false },
        },
        error: message,
      };
    }
  }
}
