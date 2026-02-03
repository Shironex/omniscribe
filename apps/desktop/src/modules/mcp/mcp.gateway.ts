import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { McpService } from './mcp.service';
import { McpConfigService } from './mcp-config.service';
import { McpStatusServerService, SessionStatusEvent } from './mcp-status-server.service';
import {
  McpServerConfig,
  McpDiscoverPayload,
  McpSetEnabledPayload,
  McpWriteConfigPayload,
  McpGetEnabledPayload,
  McpGetServersPayload,
  McpRemoveConfigPayload,
  McpDiscoverResponse,
  McpSetEnabledResponse,
  McpWriteConfigResponse,
  McpGetEnabledResponse,
  McpGetServersResponse,
  McpRemoveConfigResponse,
  McpInternalStatusResponse,
  McpStatusServerInfoResponse,
} from '@omniscribe/shared';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class McpGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  /** Map of project paths to their discovered servers */
  private projectServers = new Map<string, McpServerConfig[]>();

  /** Map of session keys to enabled server IDs */
  private sessionEnabled = new Map<string, string[]>();

  constructor(
    private readonly mcpService: McpService,
    private readonly configService: McpConfigService,
    private readonly statusServer: McpStatusServerService
  ) {}

  afterInit(): void {
    console.log('[McpGateway] Initialized');
  }

  /**
   * Handle MCP server discovery request
   */
  @SubscribeMessage('mcp:discover')
  async handleDiscover(
    @MessageBody() payload: McpDiscoverPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<McpDiscoverResponse> {
    try {
      // Validate payload has required projectPath
      if (!payload?.projectPath) {
        console.warn('[McpGateway] mcp:discover called without projectPath');
        return { servers: [], error: 'projectPath is required' };
      }

      const servers = await this.mcpService.discoverServers(payload.projectPath);

      // Cache the discovered servers
      this.projectServers.set(payload.projectPath, servers);

      console.log(
        `[McpGateway] Discovered ${servers.length} MCP servers for ${payload.projectPath}`
      );

      return { servers };
    } catch (error) {
      console.error('[McpGateway] Error discovering servers:', error);
      return {
        servers: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle setting enabled servers for a session
   */
  @SubscribeMessage('mcp:set-enabled')
  handleSetEnabled(
    @MessageBody() payload: McpSetEnabledPayload,
    @ConnectedSocket() _client: Socket
  ): McpSetEnabledResponse {
    try {
      const sessionKey = `${payload.projectPath}:${payload.sessionId}`;

      // Store the enabled servers for this session
      this.sessionEnabled.set(sessionKey, payload.serverIds);

      console.log(
        `[McpGateway] Set ${payload.serverIds.length} enabled servers for session ${payload.sessionId}`
      );

      // Broadcast the change to all clients
      this.server.emit('mcp:enabled-changed', {
        projectPath: payload.projectPath,
        sessionId: payload.sessionId,
        serverIds: payload.serverIds,
      });

      return { success: true };
    } catch (error) {
      console.error('[McpGateway] Error setting enabled servers:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle writing MCP config for a session
   */
  @SubscribeMessage('mcp:write-config')
  async handleWriteConfig(
    @MessageBody() payload: McpWriteConfigPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<McpWriteConfigResponse> {
    try {
      // Filter to only enabled servers
      const enabledServers = payload.servers.filter((s) => s.enabled);

      const configPath = await this.configService.writeConfig(
        payload.workingDir,
        payload.sessionId,
        payload.projectPath,
        enabledServers
      );

      console.log(
        `[McpGateway] Wrote MCP config for session ${payload.sessionId} to ${configPath}`
      );

      return { success: true, configPath };
    } catch (error) {
      console.error('[McpGateway] Error writing config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle getting enabled servers for a session
   */
  @SubscribeMessage('mcp:get-enabled')
  handleGetEnabled(
    @MessageBody() payload: McpGetEnabledPayload,
    @ConnectedSocket() _client: Socket
  ): McpGetEnabledResponse {
    const sessionKey = `${payload.projectPath}:${payload.sessionId}`;
    const serverIds = this.sessionEnabled.get(sessionKey) ?? [];
    return { serverIds };
  }

  /**
   * Handle getting cached servers for a project
   */
  @SubscribeMessage('mcp:get-servers')
  handleGetServers(
    @MessageBody() payload: McpGetServersPayload,
    @ConnectedSocket() _client: Socket
  ): McpGetServersResponse {
    const servers = this.projectServers.get(payload.projectPath) ?? [];
    return { servers };
  }

  /**
   * Handle removing config when session ends
   */
  @SubscribeMessage('mcp:remove-config')
  async handleRemoveConfig(
    @MessageBody() payload: McpRemoveConfigPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<McpRemoveConfigResponse> {
    try {
      const success = await this.configService.removeConfig(
        payload.workingDir,
        payload.sessionId
      );

      // Clean up enabled state
      const sessionKey = `${payload.projectPath}:${payload.sessionId}`;
      this.sessionEnabled.delete(sessionKey);

      // Clean up config tracking
      const hash = this.configService.generateProjectHash(payload.projectPath);
      await this.configService.cleanupTracking(hash, payload.sessionId);

      return { success };
    } catch (error) {
      console.error('[McpGateway] Error removing config:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get internal MCP server status
   */
  @SubscribeMessage('mcp:get-internal-status')
  handleGetInternalStatus(): McpInternalStatusResponse {
    return this.configService.getInternalMcpInfo();
  }

  /**
   * Get status server info
   */
  @SubscribeMessage('mcp:get-status-server-info')
  handleGetStatusServerInfo(): McpStatusServerInfoResponse {
    return {
      running: this.statusServer.isRunning(),
      port: this.statusServer.getPort(),
      statusUrl: this.statusServer.getStatusUrl(),
      instanceId: this.statusServer.getInstanceId(),
    };
  }

  /**
   * Broadcast session status events from the HTTP status server
   */
  @OnEvent('session.status')
  onSessionStatus(event: SessionStatusEvent): void {
    this.server.emit('session:status', {
      sessionId: event.sessionId,
      status: event.status,
      message: event.message,
      needsInputPrompt: event.needsInputPrompt,
    });
  }
}
