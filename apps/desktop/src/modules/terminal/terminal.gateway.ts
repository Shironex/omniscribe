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
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
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

// Backpressure constants
const HIGH_WATER_MARK = 16; // Pause PTY after this many undelivered packets
const PAUSE_SAFETY_TIMEOUT_MS = 10_000; // Force-resume after 10s to prevent deadlock

interface TerminalOutputEvent {
  sessionId: number;
  data: string;
}

interface TerminalClosedEvent {
  sessionId: number;
  exitCode: number;
  signal?: number;
}

@UseGuards(WsThrottlerGuard)
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

  // Backpressure tracking (per-terminal, independent of each other)
  private pendingWrites = new Map<number, number>();
  private pausedTerminals = new Set<number>();
  private pauseTimeouts = new Map<number, NodeJS.Timeout>();

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

    // Register drain listener for backpressure relief.
    // engine.io fires 'drain' when the write buffer is flushed.
    client.conn.on('drain', () => {
      // Single-client assumption: Omniscribe is a single-user desktop app with
      // one renderer process connecting via one socket. Therefore, when this
      // client's write buffer drains, it is safe to resume all paused terminals
      // unconditionally -- they all belong to this single client.
      for (const sessionId of this.pausedTerminals) {
        this.pendingWrites.set(sessionId, 0);
        this.resumeTerminal(sessionId);
      }
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
    // Only clean up tracking, do NOT kill terminal sessions
    // Terminals should persist across WebSocket disconnections because:
    // 1. WebSocket connections can be flaky and reconnect
    // 2. Users may navigate away and return
    // 3. Important processes may be running in the terminal
    // Terminals are killed explicitly via terminal:kill or session:remove

    // Resume any paused terminals to prevent deadlock when client disconnects
    // while backpressure is active
    for (const sessionId of this.pausedTerminals) {
      this.resumeTerminal(sessionId);
    }

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

  @SkipThrottle()
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

  @SkipThrottle()
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

  @SkipThrottle()
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
    } else {
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

    // Track pending writes for backpressure management
    const pending = (this.pendingWrites.get(event.sessionId) ?? 0) + 1;
    this.pendingWrites.set(event.sessionId, pending);

    // Check if backpressure threshold exceeded
    if (pending >= HIGH_WATER_MARK && !this.pausedTerminals.has(event.sessionId)) {
      this.pauseTerminal(event.sessionId);
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

    // Clean up backpressure state for closed terminal
    this.cleanupBackpressure(event.sessionId);

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

  /**
   * Handle cancel output request (sends SIGINT to terminal process)
   */
  @SubscribeMessage('terminal:cancel')
  handleCancel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { sessionId: number }
  ): { success: boolean } {
    const { sessionId } = payload;

    if (!this.terminalService.hasSession(sessionId)) {
      return { success: false };
    }

    // Send Ctrl+C (SIGINT) to the process
    this.terminalService.write(sessionId, '\x03');

    // Clear backpressure state if paused
    if (this.pausedTerminals.has(sessionId)) {
      this.resumeTerminal(sessionId);
    }

    return { success: true };
  }

  // ============================================
  // Backpressure Management
  // ============================================

  /**
   * Pause a terminal due to backpressure (too many outstanding writes)
   */
  private pauseTerminal(sessionId: number): void {
    this.terminalService.pause(sessionId);
    this.pausedTerminals.add(sessionId);
    this.logger.warn(`Backpressure activated for session ${sessionId}`);

    // Emit backpressure event to the room
    const room = `terminal:${sessionId}`;
    if (this.server) {
      this.server.to(room).emit('terminal:backpressure', { sessionId, paused: true });
    }

    // Safety timeout: force-resume after 10s to prevent deadlock
    const timeout = setTimeout(() => {
      if (this.pausedTerminals.has(sessionId)) {
        this.logger.warn(
          `Safety timeout: force-resuming session ${sessionId} after ${PAUSE_SAFETY_TIMEOUT_MS}ms`
        );
        this.resumeTerminal(sessionId);
      }
    }, PAUSE_SAFETY_TIMEOUT_MS);
    this.pauseTimeouts.set(sessionId, timeout);
  }

  /**
   * Resume a terminal after backpressure clears
   */
  private resumeTerminal(sessionId: number): void {
    if (!this.pausedTerminals.has(sessionId)) return;

    this.terminalService.resume(sessionId);
    this.pausedTerminals.delete(sessionId);
    this.pendingWrites.set(sessionId, 0);
    this.logger.debug(`Backpressure cleared for session ${sessionId}`);

    // Clear safety timeout
    const timeout = this.pauseTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.pauseTimeouts.delete(sessionId);
    }

    // Emit backpressure cleared event to the room
    const room = `terminal:${sessionId}`;
    if (this.server) {
      this.server.to(room).emit('terminal:backpressure', { sessionId, paused: false });
    }
  }

  /**
   * Clean up all backpressure state for a terminal
   */
  private cleanupBackpressure(sessionId: number): void {
    this.pausedTerminals.delete(sessionId);
    this.pendingWrites.delete(sessionId);
    const timeout = this.pauseTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.pauseTimeouts.delete(sessionId);
    }
  }
}
