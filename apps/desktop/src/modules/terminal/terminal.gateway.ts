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
  namespace: '/',
})
export class TerminalGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private clientSessions = new Map<string, Set<number>>();

  constructor(private readonly terminalService: TerminalService) {}

  afterInit(): void {
    console.log('[TerminalGateway] WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    console.log(`[TerminalGateway] Client connected: ${client.id}`);
    this.clientSessions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket): void {
    console.log(`[TerminalGateway] Client disconnected: ${client.id}`);

    // Clean up sessions owned by this client
    const sessions = this.clientSessions.get(client.id);
    if (sessions) {
      sessions.forEach((sessionId) => {
        this.terminalService.kill(sessionId);
      });
      this.clientSessions.delete(client.id);
    }
  }

  @SubscribeMessage('terminal:spawn')
  handleSpawn(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SpawnPayload,
  ): { sessionId: number } {
    const sessionId = this.terminalService.spawn(payload?.cwd, payload?.env);

    // Track session ownership
    const sessions = this.clientSessions.get(client.id);
    if (sessions) {
      sessions.add(sessionId);
    }

    // Join room for this session
    client.join(`terminal:${sessionId}`);

    console.log(`[TerminalGateway] Spawned terminal session ${sessionId} for client ${client.id}`);

    return { sessionId };
  }

  @SubscribeMessage('terminal:input')
  handleInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: InputPayload,
  ): void {
    const { sessionId, data } = payload;

    // Verify client owns this session
    const sessions = this.clientSessions.get(client.id);
    if (sessions?.has(sessionId)) {
      this.terminalService.write(sessionId, data);
    }
  }

  @SubscribeMessage('terminal:resize')
  handleResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ResizePayload,
  ): void {
    const { sessionId, cols, rows } = payload;

    // Verify client owns this session
    const sessions = this.clientSessions.get(client.id);
    if (sessions?.has(sessionId)) {
      this.terminalService.resize(sessionId, cols, rows);
    }
  }

  @SubscribeMessage('terminal:kill')
  async handleKill(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: KillPayload,
  ): Promise<void> {
    const { sessionId } = payload;

    // Verify client owns this session
    const sessions = this.clientSessions.get(client.id);
    if (sessions?.has(sessionId)) {
      await this.terminalService.kill(sessionId);
      sessions.delete(sessionId);
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
    this.server.to(`terminal:${event.sessionId}`).emit('terminal:output', {
      sessionId: event.sessionId,
      data: event.data,
    });
  }

  @OnEvent('terminal.closed')
  handleTerminalClosed(event: TerminalClosedEvent): void {
    this.server.to(`terminal:${event.sessionId}`).emit('terminal:closed', {
      sessionId: event.sessionId,
      exitCode: event.exitCode,
      signal: event.signal,
    });
  }
}
