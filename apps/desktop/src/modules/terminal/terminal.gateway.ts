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
} from '@omniscribe/shared';
import { CORS_CONFIG } from '../shared/cors.config';

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
export class TerminalGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
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
    // Gateway initialized
  }

  handleConnection(client: Socket): void {
    // Only create a new Set if client doesn't already have sessions registered
    // This prevents clearing sessions on reconnection
    if (!this.clientSessions.has(client.id)) {
      this.clientSessions.set(client.id, new Set());
    }
    this.connectedClients.set(client.id, client);
  }

  handleDisconnect(client: Socket): void {
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
    @MessageBody() payload: TerminalSpawnPayload,
  ): TerminalSpawnResponse {
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
    @MessageBody() payload: TerminalInputPayload,
  ): void {
    const { sessionId, data } = payload;

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
    @MessageBody() payload: TerminalResizePayload,
  ): void {
    const { sessionId, cols, rows } = payload;

    // Simplified: allow resize if session exists (no ownership check)
    if (this.terminalService.hasSession(sessionId)) {
      this.terminalService.resize(sessionId, cols, rows);
    }
  }

  @SubscribeMessage('terminal:kill')
  async handleKill(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalKillPayload,
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

    return { success: false, error: `Terminal session ${sessionId} not found` };
  }

  @SubscribeMessage('terminal:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: TerminalJoinPayload,
  ): TerminalJoinResponse {
    const { sessionId } = payload;

    if (this.terminalService.hasSession(sessionId)) {
      client.join(`terminal:${sessionId}`);

      // Track session ownership
      const sessions = this.clientSessions.get(client.id);
      if (sessions) {
        sessions.add(sessionId);
      }

      return { success: true };
    }

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
