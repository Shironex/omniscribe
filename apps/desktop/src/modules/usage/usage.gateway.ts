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
import { ClaudeCliGuard, RequiresClaudeCli, SkipClaudeCliCheck } from '../../common/guards';
import { UsageService } from './usage.service';
import { UsageEvents, createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { UsageFetchPayload, UsageFetchResponse, ClaudeCliStatus } from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

@UseGuards(WsThrottlerGuard, ClaudeCliGuard)
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
   * Fetches Claude CLI usage data and returns it
   */
  @SkipThrottle()
  @RequiresClaudeCli()
  @SubscribeMessage(UsageEvents.FETCH)
  async handleFetch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: UsageFetchPayload
  ): Promise<UsageFetchResponse> {
    this.logger.debug(`Fetching usage for workingDir: ${payload.workingDir}`);

    // ClaudeCliGuard ensures CLI is installed and authenticated
    // Fetch usage data
    const result = await this.usageService.fetchUsageData(payload.workingDir);

    if (result.error) {
      this.logger.warn(`Usage fetch failed: ${result.error} - ${result.message}`);
      return {
        error: result.error,
        message: result.message,
      };
    }

    this.logger.debug(`Usage fetched successfully: session=${result.usage?.sessionPercentage}%`);
    return { usage: result.usage };
  }

  /**
   * Handle usage:claude-status request - get Claude CLI status
   */
  @SkipThrottle()
  @SkipClaudeCliCheck()
  @SubscribeMessage(UsageEvents.CLAUDE_STATUS)
  async handleStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: { refresh?: boolean }
  ): Promise<{ status: ClaudeCliStatus; error?: string }> {
    try {
      const status = await this.usageService.getStatus(payload?.refresh);
      return { status };
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
