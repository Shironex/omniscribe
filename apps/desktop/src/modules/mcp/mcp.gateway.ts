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
import { OnEvent } from '@nestjs/event-emitter';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { validatePath } from '../shared/validation';
import { handleGatewayRequest } from '../shared/gateway-handler';
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
  McpCapabilityListPayload,
  McpCapabilityListResponse,
  McpCapabilityTogglePayload,
  McpCapabilityToggleResponse,
  McpCapabilityDescriptor,
  SessionTasksUpdate,
  McpEvents,
  SessionEvents,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { InternalSessionEvents } from '../shared/events';
import { McpStatusServerService } from './mcp-status-server.service';
import {
  McpDiscoveryService,
  McpWriterService,
  McpProjectCacheService,
  McpSessionRegistryService,
  McpTrackingService,
} from './services';
import { McpCapabilityRegistryService } from './services/mcp-capability-registry.service';
import { McpCapabilityStateService } from './services/mcp-capability-state.service';
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
@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class McpGateway implements OnGatewayInit {
  private readonly logger = createLogger('McpGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly discoveryService: McpDiscoveryService,
    private readonly writerService: McpWriterService,
    private readonly projectCache: McpProjectCacheService,
    private readonly sessionRegistry: McpSessionRegistryService,
    private readonly trackingService: McpTrackingService,
    private readonly statusServer: McpStatusServerService,
    private readonly capRegistry: McpCapabilityRegistryService,
    private readonly capState: McpCapabilityStateService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Handle MCP server discovery request
   */
  @SubscribeMessage(McpEvents.DISCOVER)
  async handleDiscover(
    @MessageBody() payload: McpDiscoverPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<McpDiscoverResponse> {
    // Normalize payload with possibly-undefined projectPath to a string for validation
    const normalizedPayload = { projectPath: payload?.projectPath ?? '' };
    return handleGatewayRequest({
      logger: this.logger,
      action: '[mcp:discover]',
      payload: normalizedPayload,
      defaultResult: { servers: [] as McpDiscoverResponse['servers'] },
      handler: async projectPath => {
        const servers = await this.discoveryService.discoverServers(projectPath);

        // Cache the discovered servers
        this.projectCache.setServers(projectPath, servers);

        this.logger.log(`Discovered ${servers.length} MCP servers for ${projectPath}`);

        return { servers };
      },
    });
  }

  /**
   * Handle setting enabled servers for a session
   */
  @SubscribeMessage(McpEvents.SET_ENABLED)
  handleSetEnabled(
    @MessageBody() payload: McpSetEnabledPayload,
    @ConnectedSocket() _client: Socket
  ): McpSetEnabledResponse {
    try {
      this.logger.debug(
        `[mcp:set-enabled] sessionId=${payload.sessionId}, serverIds=${payload.serverIds?.join(',')}`
      );
      // Store the enabled servers in the registry
      this.sessionRegistry.setEnabledServers(
        payload.projectPath,
        payload.sessionId,
        payload.serverIds
      );

      // Broadcast the change to all clients
      this.server.emit(McpEvents.ENABLED_CHANGED, {
        projectPath: payload.projectPath,
        sessionId: payload.sessionId,
        serverIds: payload.serverIds,
      });

      return { success: true };
    } catch (error) {
      this.logger.error('Error setting enabled servers:', error);
      return {
        success: false,
        error: extractErrorMessage(error, 'Unknown error'),
      };
    }
  }

  /**
   * Handle writing MCP config for a session
   */
  @SubscribeMessage(McpEvents.WRITE_CONFIG)
  async handleWriteConfig(
    @MessageBody() payload: McpWriteConfigPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<McpWriteConfigResponse> {
    this.logger.debug(
      `[mcp:write-config] sessionId=${payload.sessionId}, servers=${payload.servers?.length}`
    );

    const pathError = validatePath(payload.workingDir, 'workingDir');
    if (pathError) {
      return { success: false, error: pathError };
    }

    try {
      // Filter to only enabled servers
      const enabledServers = payload.servers.filter(s => s.enabled);

      const configPath = await this.writerService.writeConfig(
        payload.workingDir,
        payload.sessionId,
        payload.projectPath,
        enabledServers
      );

      this.logger.log(`Wrote MCP config for session ${payload.sessionId} to ${configPath}`);

      return { success: true, configPath };
    } catch (error) {
      this.logger.error('Error writing config:', error);
      return {
        success: false,
        error: extractErrorMessage(error, 'Unknown error'),
      };
    }
  }

  /**
   * Handle getting enabled servers for a session
   */
  @SkipThrottle()
  @SubscribeMessage(McpEvents.GET_ENABLED)
  handleGetEnabled(
    @MessageBody() payload: McpGetEnabledPayload,
    @ConnectedSocket() _client: Socket
  ): McpGetEnabledResponse {
    this.logger.debug(`[mcp:get-enabled] sessionId=${payload.sessionId}`);
    const serverIds = this.sessionRegistry.getEnabledServers(
      payload.projectPath,
      payload.sessionId
    );
    return { serverIds };
  }

  /**
   * Handle getting cached servers for a project
   */
  @SkipThrottle()
  @SubscribeMessage(McpEvents.GET_SERVERS)
  handleGetServers(
    @MessageBody() payload: McpGetServersPayload,
    @ConnectedSocket() _client: Socket
  ): McpGetServersResponse {
    this.logger.debug(`[mcp:get-servers] projectPath=${payload.projectPath}`);
    const servers = this.projectCache.getServers(payload.projectPath);
    return { servers };
  }

  /**
   * Handle removing config when session ends
   */
  @SubscribeMessage(McpEvents.REMOVE_CONFIG)
  async handleRemoveConfig(
    @MessageBody() payload: McpRemoveConfigPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<McpRemoveConfigResponse> {
    this.logger.debug(`[mcp:remove-config] sessionId=${payload.sessionId}`);

    const pathError = validatePath(payload.workingDir, 'workingDir');
    if (pathError) {
      return { success: false, error: pathError };
    }

    try {
      const success = await this.writerService.removeConfig(payload.workingDir, payload.sessionId);

      // Clean up enabled state in registry
      this.sessionRegistry.clearEnabledServers(payload.projectPath, payload.sessionId);

      // Clean up config tracking
      const hash = this.writerService.generateProjectHash(payload.projectPath);
      await this.trackingService.cleanup(hash, payload.sessionId);

      return { success };
    } catch (error) {
      this.logger.error('Error removing config:', error);
      return { success: false, error: extractErrorMessage(error, 'Unknown error') };
    }
  }

  /**
   * Get internal MCP server status
   */
  @SkipThrottle()
  @SubscribeMessage(McpEvents.GET_INTERNAL_STATUS)
  handleGetInternalStatus(): McpInternalStatusResponse {
    this.logger.debug('[mcp:get-internal-status] called');
    return this.writerService.getInternalMcpInfo();
  }

  /**
   * Get status server info
   */
  @SkipThrottle()
  @SubscribeMessage(McpEvents.GET_STATUS_SERVER_INFO)
  handleGetStatusServerInfo(): McpStatusServerInfoResponse {
    this.logger.debug('[mcp:get-status-server-info] called');
    return {
      running: this.statusServer.isRunning(),
      port: this.statusServer.getPort(),
      statusUrl: this.statusServer.getStatusUrl(),
      instanceId: this.statusServer.getInstanceId(),
    };
  }

  /**
   * List all registered MCP capabilities, merged with the per-project
   * enabled state. Used by the Settings UI.
   */
  @SkipThrottle()
  @SubscribeMessage(McpEvents.CAPABILITY_LIST)
  handleCapabilityList(
    @MessageBody() payload: McpCapabilityListPayload,
    @ConnectedSocket() _client: Socket
  ): McpCapabilityListResponse {
    try {
      const projectPath = payload?.projectPath;
      if (!projectPath || typeof projectPath !== 'string') {
        return {
          capabilities: [],
          error: 'Invalid projectPath: must be a non-empty string',
        };
      }

      const enabled = new Set(this.capState.getEnabled(projectPath));
      const capabilities: McpCapabilityDescriptor[] = this.capRegistry.list().map(cap => ({
        id: cap.id,
        label: cap.label,
        description: cap.description,
        enabled: enabled.has(cap.id),
      }));

      return { capabilities };
    } catch (error) {
      this.logger.error('Error listing capabilities:', error);
      return {
        capabilities: [],
        error: extractErrorMessage(error, 'Unknown error'),
      };
    }
  }

  /**
   * Toggle a capability on/off for a project, broadcast the change.
   */
  @SubscribeMessage(McpEvents.CAPABILITY_TOGGLE)
  handleCapabilityToggle(
    @MessageBody() payload: McpCapabilityTogglePayload,
    @ConnectedSocket() _client: Socket
  ): McpCapabilityToggleResponse {
    try {
      const { projectPath, capabilityId, enabled } = payload ?? ({} as McpCapabilityTogglePayload);
      if (!projectPath || typeof projectPath !== 'string') {
        return { success: false, error: 'Invalid projectPath: must be a non-empty string' };
      }
      if (!capabilityId || typeof capabilityId !== 'string') {
        return { success: false, error: 'Invalid capabilityId: must be a non-empty string' };
      }
      if (!this.capRegistry.get(capabilityId)) {
        return { success: false, error: `Unknown capability: ${capabilityId}` };
      }

      const enabledIds = this.capState.toggle(projectPath, capabilityId, Boolean(enabled));

      this.server.emit(McpEvents.CAPABILITY_CHANGED, {
        projectPath,
        enabledIds,
      });

      return { success: true, enabledIds };
    } catch (error) {
      this.logger.error('Error toggling capability:', error);
      return {
        success: false,
        error: extractErrorMessage(error, 'Unknown error'),
      };
    }
  }

  /**
   * Broadcast session tasks events from the HTTP status server
   */
  @OnEvent(InternalSessionEvents.TASKS)
  onSessionTasks(event: SessionTasksUpdate): void {
    this.logger.debug(`[session:tasks] broadcasting for ${event.sessionId}`);
    this.server.emit(SessionEvents.TASKS, {
      sessionId: event.sessionId,
      tasks: event.tasks,
    });
  }
}
