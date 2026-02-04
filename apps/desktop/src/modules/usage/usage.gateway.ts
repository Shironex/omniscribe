import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UsageService } from './usage.service';
import { createLogger } from '@omniscribe/shared';
import type {
  UsageFetchPayload,
  UsageFetchResponse,
  ClaudeCliStatus,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class UsageGateway {
  @WebSocketServer()
  server!: Server;

  private readonly logger = createLogger('UsageGateway');

  constructor(private readonly usageService: UsageService) {}

  /**
   * Handle usage:fetch request from client
   * Fetches Claude CLI usage data and returns it
   */
  @SubscribeMessage('usage:fetch')
  async handleFetch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: UsageFetchPayload
  ): Promise<UsageFetchResponse> {
    this.logger.debug(`Fetching usage for workingDir: ${payload.workingDir}`);

    // Check if CLI is available
    const isAvailable = await this.usageService.isAvailable();
    if (!isAvailable) {
      return {
        error: 'cli_not_found',
        message: 'Claude CLI not found. Please install Claude Code CLI.',
      };
    }

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
   * Handle claude:status request - get Claude CLI status
   */
  @SubscribeMessage('claude:status')
  async handleStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload?: { refresh?: boolean }
  ): Promise<{ status: ClaudeCliStatus; error?: string }> {
    try {
      const status = await this.usageService.getStatus(payload?.refresh);
      return { status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
