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
import { SessionService, ExtendedSessionConfig, SessionStatusUpdate } from './session.service';
import { AiMode, UpdateSessionOptions } from '@omniscribe/shared';

/**
 * Payload for creating a session
 */
interface CreateSessionPayload {
  mode: AiMode;
  projectPath: string;
  branch?: string;
  name?: string;
  workingDirectory?: string;
  model?: string;
  systemPrompt?: string;
  mcpServers?: string[];
}

/**
 * Payload for updating a session
 */
interface UpdateSessionPayload {
  sessionId: string;
  updates: UpdateSessionOptions;
}

/**
 * Payload for removing a session
 */
interface RemoveSessionPayload {
  sessionId: string;
}

/**
 * Payload for listing sessions
 */
interface ListSessionsPayload {
  projectPath?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SessionGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly sessionService: SessionService) {}

  afterInit(): void {
    console.log('[SessionGateway] Initialized');
  }

  /**
   * Handle session creation request
   */
  @SubscribeMessage('session:create')
  handleCreate(
    @MessageBody() payload: CreateSessionPayload,
    @ConnectedSocket() client: Socket
  ): ExtendedSessionConfig {
    const session = this.sessionService.create(payload.mode, payload.projectPath, {
      name: payload.name,
      workingDirectory: payload.workingDirectory,
      model: payload.model,
      systemPrompt: payload.systemPrompt,
      mcpServers: payload.mcpServers,
    });

    // If a branch was specified, assign it
    if (payload.branch) {
      this.sessionService.assignBranch(session.id, payload.branch);
    }

    return session;
  }

  /**
   * Handle session update request
   */
  @SubscribeMessage('session:update')
  handleUpdate(
    @MessageBody() payload: UpdateSessionPayload,
    @ConnectedSocket() client: Socket
  ): ExtendedSessionConfig | { error: string } {
    const session = this.sessionService.get(payload.sessionId);

    if (!session) {
      return { error: `Session not found: ${payload.sessionId}` };
    }

    // Apply updates to session
    const updates = payload.updates;

    if (updates.name !== undefined) {
      session.name = updates.name;
    }
    if (updates.aiMode !== undefined) {
      session.aiMode = updates.aiMode;
    }
    if (updates.model !== undefined) {
      session.model = updates.model;
    }
    if (updates.systemPrompt !== undefined) {
      session.systemPrompt = updates.systemPrompt;
    }
    if (updates.maxTokens !== undefined) {
      session.maxTokens = updates.maxTokens;
    }
    if (updates.temperature !== undefined) {
      session.temperature = updates.temperature;
    }
    if (updates.mcpServers !== undefined) {
      session.mcpServers = updates.mcpServers;
    }

    session.lastActiveAt = new Date();

    // Emit status update for the change
    this.server.emit('session:status', {
      sessionId: session.id,
      status: session.status,
      message: 'Session updated',
    });

    return session;
  }

  /**
   * Handle session removal request
   */
  @SubscribeMessage('session:remove')
  handleRemove(
    @MessageBody() payload: RemoveSessionPayload,
    @ConnectedSocket() client: Socket
  ): { success: boolean; error?: string } {
    const success = this.sessionService.remove(payload.sessionId);

    if (!success) {
      return { success: false, error: `Session not found: ${payload.sessionId}` };
    }

    return { success: true };
  }

  /**
   * Handle session list request
   */
  @SubscribeMessage('session:list')
  handleList(
    @MessageBody() payload: ListSessionsPayload,
    @ConnectedSocket() client: Socket
  ): ExtendedSessionConfig[] {
    if (payload.projectPath) {
      return this.sessionService.getForProject(payload.projectPath);
    }

    return this.sessionService.getAll();
  }

  /**
   * Broadcast session created event
   */
  @OnEvent('session.created')
  onSessionCreated(session: ExtendedSessionConfig): void {
    this.server.emit('session:created', session);
  }

  /**
   * Broadcast session status event
   */
  @OnEvent('session.status')
  onSessionStatus(update: SessionStatusUpdate): void {
    this.server.emit('session:status', update);
  }

  /**
   * Broadcast session removed event
   */
  @OnEvent('session.removed')
  onSessionRemoved(payload: { sessionId: string }): void {
    this.server.emit('session:removed', payload);
  }
}
