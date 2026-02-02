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

interface SpawnPayload {
  cwd?: string;
  env?: Record<string, string>;
}

interface InputPayload {
  sessionId: number;
  data: string;
}

interface ResizePayload {
  sessionId: number;
  cols: number;
  rows: number;
}

interface KillPayload {
  sessionId: number;
}

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
  cors: {
    origin: '*',
    credentials: true,
  },
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

  // Instance ID for debugging multiple instances
  private readonly instanceId = Math.random().toString(36).substring(7);
  private static instanceCount = 0;

  constructor(private readonly terminalService: TerminalService) {
    TerminalGateway.instanceCount++;
    console.log(`[TerminalGateway] Constructor called, instance: ${this.instanceId}, total instances: ${TerminalGateway.instanceCount}`);
  }

  // Getters for the static Maps (for convenience)
  private get clientSessions(): Map<string, Set<number>> {
    return TerminalGateway.clientSessions;
  }

  private get connectedClients(): Map<string, Socket> {
    return TerminalGateway.connectedClients;
  }

  afterInit(): void {
    console.log(`[TerminalGateway] WebSocket gateway initialized (instance ${TerminalGateway.instanceCount})`);
  }

  handleConnection(client: Socket): void {
    console.log(`[TerminalGateway] Client connected: ${client.id}`);

    // Only create a new Set if client doesn't already have sessions registered
    // This prevents clearing sessions on reconnection
    if (!this.clientSessions.has(client.id)) {
      this.clientSessions.set(client.id, new Set());
    } else {
      const existingSessions = Array.from(this.clientSessions.get(client.id)!);
      console.log(`[TerminalGateway] Client ${client.id} reconnected, preserving ${existingSessions.length} sessions: [${existingSessions.join(', ')}]`);
    }
    this.connectedClients.set(client.id, client);
  }

  handleDisconnect(client: Socket): void {
    console.log(`[TerminalGateway] Client disconnected: ${client.id}`);

    // Only clean up tracking, do NOT kill terminal sessions
    // Terminals should persist across WebSocket disconnections because:
    // 1. WebSocket connections can be flaky and reconnect
    // 2. Users may navigate away and return
    // 3. Important processes may be running in the terminal
    // Terminals are killed explicitly via terminal:kill or session:remove
    const sessions = this.clientSessions.get(client.id);
    if (sessions && sessions.size > 0) {
      console.log(`[TerminalGateway] Client ${client.id} had ${sessions.size} sessions, keeping them alive: [${Array.from(sessions).join(', ')}]`);
    }
    this.clientSessions.delete(client.id);
    this.connectedClients.delete(client.id);
  }

  @SubscribeMessage('terminal:spawn')
  handleSpawn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SpawnPayload,
  ): { sessionId: number } {
    console.log(`[TerminalGateway] terminal:spawn received from client ${client.id}`);
    console.log(`[TerminalGateway] Payload: ${JSON.stringify(payload)}`);

    const sessionId = this.terminalService.spawn(payload?.cwd, payload?.env);

    console.log(`[TerminalGateway] TerminalService.spawn() returned sessionId: ${sessionId}`);

    // Track session ownership
    const sessions = this.clientSessions.get(client.id);
    if (sessions) {
      sessions.add(sessionId);
    }

    // Join room for this session
    client.join(`terminal:${sessionId}`);

    console.log(`[TerminalGateway] Spawned terminal session ${sessionId} for client ${client.id}`);

    // Check if session still exists after spawn (debugging immediate exit)
    setTimeout(() => {
      const stillExists = this.terminalService.hasSession(sessionId);
      console.log(`[TerminalGateway] After 100ms: session ${sessionId} still exists? ${stillExists}`);
    }, 100);

    setTimeout(() => {
      const stillExists = this.terminalService.hasSession(sessionId);
      console.log(`[TerminalGateway] After 500ms: session ${sessionId} still exists? ${stillExists}`);
    }, 500);

    return { sessionId };
  }

  @SubscribeMessage('terminal:input')
  handleInput(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: InputPayload,
  ): void {
    const { sessionId, data } = payload;

    // Simplified pattern from automaker: if client is in the terminal room, allow input
    // No ownership checking - if you're connected to the session, you can write to it
    if (this.terminalService.hasSession(sessionId)) {
      this.terminalService.write(sessionId, data);
    } else {
      console.warn(`[TerminalGateway] Session ${sessionId} does not exist`);
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

    console.log(`[TerminalGateway] Registered client ${clientId} as owner of session ${sessionId}. Client now owns sessions: [${Array.from(sessions).join(', ')}]`);
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
    @MessageBody() payload: ResizePayload,
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
    @MessageBody() payload: KillPayload,
  ): Promise<void> {
    const { sessionId } = payload;

    // Simplified: allow kill if session exists (no ownership check)
    if (this.terminalService.hasSession(sessionId)) {
      await this.terminalService.kill(sessionId);

      // Clean up tracking for all clients that had this session
      for (const sessions of this.clientSessions.values()) {
        sessions.delete(sessionId);
      }
      client.leave(`terminal:${sessionId}`);
    }
  }

  @SubscribeMessage('terminal:join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { sessionId: number },
  ): { success: boolean } {
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

    return { success: false };
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
      const roomSize = this.server.sockets?.adapter?.rooms?.get(room)?.size ?? 0;
      console.log(`[TerminalGateway] Emitting terminal:output to room ${room} (${roomSize} clients)`);
      this.server.to(room).emit('terminal:output', payload);
      return;
    }

    // Fallback: emit directly to clients that own this session
    console.log(`[TerminalGateway] Server not ready, using direct client emit for session ${event.sessionId}`);
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
    console.log(`[TerminalGateway] terminal.closed event received for session ${event.sessionId}`);
    console.log(`[TerminalGateway] exitCode: ${event.exitCode}, signal: ${event.signal}`);

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
    console.log(`[TerminalGateway] Server not ready, using direct client emit for terminal:closed session ${event.sessionId}`);
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
