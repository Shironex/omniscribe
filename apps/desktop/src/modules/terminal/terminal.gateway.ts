import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { TerminalService } from './terminal.service';
import {
  TerminalSpawnPayload,
  TerminalInputPayload,
  TerminalResizePayload,
  TerminalKillPayload,
  TerminalJoinPayload,
  TerminalSpawnResponse,
  TerminalJoinResponse,
  SuccessResponse,
  createLogger,
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

const MAX_INPUT_SIZE = 1_048_576; // 1MB

interface TerminalOutputEvent {
  sessionId: number;
  data: string;
}

interface TerminalClosedEvent {
  sessionId: number;
  exitCode: number;
  signal?: number;
}

@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class TerminalGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = createLogger('TerminalGateway');

  @WebSocketServer()
  server!: Server;

  // Use static Maps to ensure data persists across potential multiple gateway instances
  // This is a defensive fix for NestJS DI behavior where module imports can create multiple instances
  private static clientSessions = new Map<string, Set<number>>();
  private static connectedClients = new Map<string, Socket>();

  constructor(private readonly terminalService: TerminalService) {}

  // Getters for the static Maps (for convenience)
  private get clientSessions(): Map<string, Set<number>> {
    return TerminalGateway.clientSessions;
  }

  private get connectedClients(): Map<string, Socket> {
    return TerminalGateway.connectedClients;
  }

  afterInit(): void {
    this.logger.log('Initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
    // Only create a new Set if client doesn't already have sessions registered
    // This prevents clearing sessions on reconnection
    if (!this.clientSessions.has(client.id)) {
      this.clientSessions.set(client.id, new Set());
    }
    this.connectedClients.set(client.id, client);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
    // Only clean up tracking, do NOT kill terminal sessions
    // Terminals should persist across WebSocket disconnections because:
    // 1. WebSocket connections can be flaky and reconnect
    // 2. Users may navigate away and return
    // 3. Important processes may be running in the terminal
    // Terminals are killed explicitly via terminal:kill or session:remove
    this.clientSessions.delete(client.id);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('terminal:spawn')
  handleSpawn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalSpawnPayload
  ): TerminalSpawnResponse {
    this.logger.info(`Spawning terminal for client ${client.id} (cwd: ${payload?.cwd})`);
    const sessionId = this.terminalService.spawn(payload?.cwd, payload?.env);

    // Track session ownership
    const sessions = this.clientSessions.get(client.id);
    if (sessions) {
      sessions.add(sessionId);
    }

    // Join room for this session
    client.join(`terminal:${sessionId}`);

    return { sessionId };
  }

  @SubscribeMessage('terminal:input')
  handleInput(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: TerminalInputPayload
  ): void {
    const { sessionId, data } = payload;

    // Payload validation
    if (typeof data !== 'string') {
      this.logger.warn(`[input] Invalid data type for session ${sessionId}: ${typeof data}`);
      return;
    }
    if (data.length > MAX_INPUT_SIZE) {
      this.logger.warn(
        `[input] Data too large for session ${sessionId}: ${data.length} chars (max ${MAX_INPUT_SIZE})`
      );
      return;
    }

    // Simplified pattern from automaker: if client is in the terminal room, allow input
    // No ownership checking - if you're connected to the session, you can write to it
    if (this.terminalService.hasSession(sessionId)) {
      this.terminalService.write(sessionId, data);
    }
  }

  /**
   * Register a client as owner of a terminal session.
   * Used when sessions are created through other gateways (e.g., SessionGateway).
   */
  registerClientSession(clientId: string, sessionId: number): void {
    let sessions = this.clientSessions.get(clientId);
    if (!sessions) {
      sessions = new Set();
      this.clientSessions.set(clientId, sessions);
    }
    sessions.add(sessionId);
  }

  /**
   * Get the socket for a specific client ID
   */
  getClientSocket(clientId: string): Socket | undefined {
    return this.connectedClients.get(clientId);
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: TerminalResizePayload
  ): void {
    const { sessionId, cols, rows } = payload;

    // Payload validation
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0) {
      this.logger.warn(`[resize] Invalid dimensions for session ${sessionId}: ${cols}x${rows}`);
      return;
    }

    // Simplified: allow resize if session exists (no ownership check)
    if (this.terminalService.hasSession(sessionId)) {
      this.terminalService.resize(sessionId, cols, rows);
    }
  }

  @SubscribeMessage('terminal:kill')
  async handleKill(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalKillPayload
  ): Promise<SuccessResponse> {
    const { sessionId } = payload;

    // Simplified: allow kill if session exists (no ownership check)
    if (this.terminalService.hasSession(sessionId)) {
      await this.terminalService.kill(sessionId);

      // Clean up tracking for all clients that had this session
      for (const sessions of this.clientSessions.values()) {
        sessions.delete(sessionId);
      }
      client.leave(`terminal:${sessionId}`);
      return { success: true };
    }

    this.logger.warn(`Kill requested for non-existent terminal session ${sessionId}`);
    return { success: false, error: `Terminal session ${sessionId} not found` };
  }

  @SubscribeMessage('terminal:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalJoinPayload
  ): TerminalJoinResponse {
    const { sessionId } = payload;

    if (this.terminalService.hasSession(sessionId)) {
      client.join(`terminal:${sessionId}`);

      // Track session ownership
      const sessions = this.clientSessions.get(client.id);
      if (sessions) {
        sessions.add(sessionId);
      }

      // Include scrollback data for session restore
      const scrollback = this.terminalService.getScrollback(sessionId);
      return { success: true, scrollback: scrollback ?? undefined };
    }

    this.logger.warn(`Join requested for non-existent terminal session ${sessionId}`);
    return { success: false, error: `Terminal session ${sessionId} not found` };
  }

  @OnEvent('terminal.output')
  handleTerminalOutput(event: TerminalOutputEvent): void {
    const room = `terminal:${event.sessionId}`;
    const payload = {
      sessionId: event.sessionId,
      data: event.data,
    };

    // Prefer using the server if available
    if (this.server) {
      this.server.to(room).emit('terminal:output', payload);
      return;
    }

    // Fallback: emit directly to clients that own this session
    for (const [clientId, sessions] of this.clientSessions.entries()) {
      if (sessions.has(event.sessionId)) {
        const client = this.connectedClients.get(clientId);
        if (client) {
          client.emit('terminal:output', payload);
        }
      }
    }
  }

  @OnEvent('terminal.closed')
  handleTerminalClosed(event: TerminalClosedEvent): void {
    const room = `terminal:${event.sessionId}`;
    const payload = {
      sessionId: event.sessionId,
      exitCode: event.exitCode,
      signal: event.signal,
    };

    // Prefer using the server if available
    if (this.server) {
      this.server.to(room).emit('terminal:closed', payload);
      return;
    }

    // Fallback: emit directly to clients that own this session
    for (const [clientId, sessions] of this.clientSessions.entries()) {
      if (sessions.has(event.sessionId)) {
        const client = this.connectedClients.get(clientId);
        if (client) {
          client.emit('terminal:closed', payload);
        }
      }
    }
  }
}
