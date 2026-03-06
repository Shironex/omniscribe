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
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import {
  SwarmEvents,
  SwarmConfig,
  SwarmStatusUpdate,
  SwarmAgentUpdate,
  SwarmTaskUpdate,
  SwarmMessageUpdate,
  SwarmContextResponse,
  CreateSwarmPayload,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { InternalSwarmEvents } from '../shared/events';
import { CORS_CONFIG } from '../shared/cors.config';
import { SwarmService } from './swarm.service';

interface SwarmResponse {
  swarm?: SwarmConfig;
  error?: string;
}

interface SwarmContextResponseWrapper {
  context?: SwarmContextResponse;
  error?: string;
}

interface SwarmListResponse {
  swarms: SwarmConfig[];
}

interface SwarmCancelResponse {
  success: boolean;
  error?: string;
}

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class SwarmGateway implements OnGatewayInit {
  private readonly logger = createLogger('SwarmGateway');

  @WebSocketServer()
  server!: Server;

  constructor(private readonly swarmService: SwarmService) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Handle swarm creation request.
   */
  @SkipThrottle()
  @SubscribeMessage(SwarmEvents.CREATE)
  async handleCreate(
    @MessageBody() payload: CreateSwarmPayload,
    @ConnectedSocket() _client: Socket
  ): Promise<SwarmResponse> {
    this.logger.debug(`[swarm:create] name=${payload.name}, project=${payload.projectPath}`);

    try {
      const swarm = await this.swarmService.create(payload);
      return { swarm };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.error(`Failed to create swarm: ${errorMessage}`);
      return { error: errorMessage };
    }
  }

  /**
   * Handle swarm list request.
   */
  @SkipThrottle()
  @SubscribeMessage(SwarmEvents.LIST)
  handleList(
    @MessageBody() _payload: Record<string, unknown>,
    @ConnectedSocket() _client: Socket
  ): SwarmListResponse {
    this.logger.debug('[swarm:list]');
    return { swarms: this.swarmService.getSwarms() };
  }

  /**
   * Handle swarm get request (full context).
   */
  @SkipThrottle()
  @SubscribeMessage(SwarmEvents.GET)
  handleGet(
    @MessageBody() payload: { swarmId: string },
    @ConnectedSocket() _client: Socket
  ): SwarmContextResponseWrapper {
    this.logger.debug(`[swarm:get] swarmId=${payload.swarmId}`);
    const context = this.swarmService.getSwarmContext(payload.swarmId);

    if (!context) {
      return { error: `Swarm not found: ${payload.swarmId}` };
    }

    return { context };
  }

  /**
   * Handle swarm cancel request.
   */
  @SkipThrottle()
  @SubscribeMessage(SwarmEvents.CANCEL)
  async handleCancel(
    @MessageBody() payload: { swarmId: string },
    @ConnectedSocket() _client: Socket
  ): Promise<SwarmCancelResponse> {
    this.logger.debug(`[swarm:cancel] swarmId=${payload.swarmId}`);

    try {
      await this.swarmService.cancel(payload.swarmId);
      return { success: true };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.error(`Failed to cancel swarm: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle stop single agent request.
   */
  @SkipThrottle()
  @SubscribeMessage(SwarmEvents.STOP_AGENT)
  async handleStopAgent(
    @MessageBody() payload: { swarmId: string; agentId: string },
    @ConnectedSocket() _client: Socket
  ): Promise<SwarmCancelResponse> {
    this.logger.debug(`[swarm:stop-agent] swarmId=${payload.swarmId}, agentId=${payload.agentId}`);

    try {
      await this.swarmService.stopAgent(payload.swarmId, payload.agentId);
      return { success: true };
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.error(`Failed to stop agent: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  // ====================
  // Internal event broadcasting
  // ====================

  /**
   * Broadcast swarm created event.
   */
  @OnEvent(InternalSwarmEvents.CREATED)
  onSwarmCreated(swarm: SwarmConfig): void {
    this.logger.debug(`[swarm:created] broadcasting for ${swarm.id}`);
    this.server.emit(SwarmEvents.CREATED, swarm);
  }

  /**
   * Broadcast swarm status update event.
   */
  @OnEvent(InternalSwarmEvents.STATUS)
  onSwarmStatus(update: SwarmStatusUpdate): void {
    this.server.emit(SwarmEvents.STATUS, update);
  }

  /**
   * Broadcast agent updated event.
   */
  @OnEvent(InternalSwarmEvents.AGENT_UPDATED)
  onAgentUpdated(update: SwarmAgentUpdate): void {
    this.server.emit(SwarmEvents.AGENT_UPDATED, update);
  }

  /**
   * Broadcast task updated event.
   */
  @OnEvent(InternalSwarmEvents.TASK_UPDATED)
  onTaskUpdated(update: SwarmTaskUpdate): void {
    this.server.emit(SwarmEvents.TASK_UPDATED, update);
  }

  /**
   * Broadcast inter-agent message event.
   */
  @OnEvent(InternalSwarmEvents.MESSAGE)
  onMessage(update: SwarmMessageUpdate): void {
    this.server.emit(SwarmEvents.MESSAGE, update);
  }

  /**
   * Broadcast swarm completed event.
   */
  @OnEvent(InternalSwarmEvents.COMPLETED)
  onCompleted(payload: { swarmId: string; status: string }): void {
    this.logger.debug(`[swarm:completed] broadcasting for ${payload.swarmId}`);
    this.server.emit(SwarmEvents.COMPLETED, payload);
  }

  @OnEvent(InternalSwarmEvents.REMOVED)
  onRemoved(payload: { swarmId: string }): void {
    this.logger.debug(`[swarm:removed] broadcasting for ${payload.swarmId}`);
    this.server.emit(SwarmEvents.REMOVED, payload);
  }
}
