import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import {
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
import { McpStatusServerService, SessionStatusEvent } from './mcp-status-server.service';
import {
  McpDiscoveryService,
  McpWriterService,
  McpProjectCacheService,
  McpSessionRegistryService,
  McpTrackingService,
} from './services';
import { CORS_CONFIG } from '../shared/cors.config';

/**
 * WebSocket gateway for MCP-related operations.
 *
 * This is a thin layer that delegates to specialized services:
 * - McpDiscoveryService: Server discovery and parsing
 * - McpWriterService: Config file writing
 * - McpProjectCacheService: Server caching per project
 * - McpSessionRegistryService: Session state management
 * - McpTrackingService: Config tracking
 */
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class McpGateway implements OnGatewayInit {
  private readonly logger = new Logger(McpGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly discoveryService: McpDiscoveryService,
    private readonly writerService: McpWriterService,
    private readonly projectCache: McpProjectCacheService,
    private readonly sessionRegistry: McpSessionRegistryService,
    private readonly trackingService: McpTrackingService,
    private readonly statusServer: McpStatusServerService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
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
        this.logger.warn('mcp:discover called without projectPath');
        return { servers: [], error: 'projectPath is required' };
      }

      const servers = await this.discoveryService.discoverServers(payload.projectPath);

      // Cache the discovered servers
      this.projectCache.setServers(payload.projectPath, servers);

      this.logger.log(
        `Discovered ${servers.length} MCP servers for ${payload.projectPath}`
      );

      return { servers };
    } catch (error) {
      this.logger.error('Error discovering servers:', error);
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
      // Store the enabled servers in the registry
      this.sessionRegistry.setEnabledServers(
        payload.projectPath,
        payload.sessionId,
        payload.serverIds
      );

      // Broadcast the change to all clients
      this.server.emit('mcp:enabled-changed', {
        projectPath: payload.projectPath,
        sessionId: payload.sessionId,
        serverIds: payload.serverIds,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error setting enabled servers:', error);
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

      const configPath = await this.writerService.writeConfig(
        payload.workingDir,
        payload.sessionId,
        payload.projectPath,
        enabledServers
      );

      this.logger.log(
        `Wrote MCP config for session ${payload.sessionId} to ${configPath}`
      );

      return { success: true, configPath };
    } catch (error) {
      this.logger.error('Error writing config:', error);
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
    const serverIds = this.sessionRegistry.getEnabledServers(
      payload.projectPath,
      payload.sessionId
    );
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
    const servers = this.projectCache.getServers(payload.projectPath);
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
      const success = await this.writerService.removeConfig(
        payload.workingDir,
        payload.sessionId
      );

      // Clean up enabled state in registry
      this.sessionRegistry.clearEnabledServers(
        payload.projectPath,
        payload.sessionId
      );

      // Clean up config tracking
      const hash = this.writerService.generateProjectHash(payload.projectPath);
      await this.trackingService.cleanup(hash, payload.sessionId);

      return { success };
    } catch (error) {
      this.logger.error('Error removing config:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Get internal MCP server status
   */
  @SubscribeMessage('mcp:get-internal-status')
  handleGetInternalStatus(): McpInternalStatusResponse {
    return this.writerService.getInternalMcpInfo();
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
