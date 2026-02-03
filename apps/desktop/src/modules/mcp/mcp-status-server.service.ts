import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as http from 'http';
import * as crypto from 'crypto';

/**
 * Status payload received from MCP server via HTTP POST
 */
interface StatusPayload {
  sessionId: string;
  instanceId: string;
  state: 'idle' | 'working' | 'needs_input' | 'finished' | 'error';
  message: string;
  needsInputPrompt?: string;
  timestamp: string;
}

/**
 * Session status event emitted for UI updates
 */
export interface SessionStatusEvent {
  sessionId: string;
  status: 'idle' | 'working' | 'needs_input' | 'finished' | 'error';
  message?: string;
  needsInputPrompt?: string;
}

/**
 * HTTP-based status server that receives status updates from MCP servers.
 *
 * Replaces file-based polling with real-time HTTP POST endpoint.
 * Provides instance ID validation to prevent cross-instance pollution.
 */
@Injectable()
export class McpStatusServerService implements OnModuleInit, OnModuleDestroy {
  /** Port range for status server */
  private readonly PORT_RANGE_START = 9900;
  private readonly PORT_RANGE_END = 9999;

  /** HTTP server instance */
  private server: http.Server | null = null;

  /** Port the server is listening on */
  private port: number | null = null;

  /** Unique instance ID for this Omniscribe instance */
  private readonly instanceId: string;

  /** Maps session IDs to project paths for routing */
  private sessionProjects = new Map<string, string>();

  constructor(private readonly eventEmitter: EventEmitter2) {
    // Generate unique instance ID on startup
    this.instanceId = crypto.randomUUID();
  }

  async onModuleInit(): Promise<void> {
    await this.startServer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopServer();
  }

  /**
   * Find an available port in the configured range
   */
  private findAvailablePort(): Promise<number | null> {
    return new Promise((resolve) => {
      let currentPort = this.PORT_RANGE_START;

      const tryPort = (): void => {
        if (currentPort > this.PORT_RANGE_END) {
          resolve(null);
          return;
        }

        const testServer = http.createServer();
        testServer.once('error', () => {
          currentPort++;
          tryPort();
        });
        testServer.once('listening', () => {
          testServer.close(() => {
            resolve(currentPort);
          });
        });
        testServer.listen(currentPort, '127.0.0.1');
      };

      tryPort();
    });
  }

  /**
   * Start the HTTP status server
   */
  private async startServer(): Promise<void> {
    const availablePort = await this.findAvailablePort();

    if (!availablePort) {
      console.error(
        `[McpStatusServer] No available port found in range ${this.PORT_RANGE_START}-${this.PORT_RANGE_END}`
      );
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.once('error', (err) => {
        console.error('[McpStatusServer] Server error:', err);
        reject(err);
      });

      this.server!.listen(availablePort, '127.0.0.1', () => {
        this.port = availablePort;
        console.log(
          `[McpStatusServer] Started on http://127.0.0.1:${this.port}`
        );
        console.log(`[McpStatusServer] Instance ID: ${this.instanceId}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP status server
   */
  private async stopServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[McpStatusServer] Stopped');
          this.server = null;
          this.port = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Only accept POST /status
    if (req.method !== 'POST' || req.url !== '/status') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
      // Limit body size to prevent abuse
      if (body.length > 10000) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body) as StatusPayload;
        this.handleStatusUpdate(payload, res);
      } catch (error) {
        console.error('[McpStatusServer] Invalid JSON payload:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

    req.on('error', (error) => {
      console.error('[McpStatusServer] Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    });
  }

  /**
   * Handle a status update from the MCP server
   */
  private handleStatusUpdate(payload: StatusPayload, res: http.ServerResponse): void {
    console.log(
      `[McpStatusServer] Received: sessionId=${payload.sessionId}, instanceId=${payload.instanceId}, state=${payload.state}`
    );

    // Validate instance ID to prevent cross-instance pollution
    if (payload.instanceId !== this.instanceId) {
      console.log(
        `[McpStatusServer] REJECTED - wrong instance: expected ${this.instanceId}, got ${payload.instanceId}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'instance_mismatch' }));
      return;
    }

    // Check if this session is registered
    const projectPath = this.sessionProjects.get(payload.sessionId);
    if (!projectPath) {
      console.log(
        `[McpStatusServer] REJECTED - unknown session ${payload.sessionId}`
      );
      console.log(
        `[McpStatusServer] Registered sessions: ${Array.from(this.sessionProjects.keys()).join(', ')}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'unknown_session' }));
      return;
    }

    // Emit status event for UI
    const event: SessionStatusEvent = {
      sessionId: payload.sessionId,
      status: payload.state,
      message: payload.message,
      needsInputPrompt: payload.needsInputPrompt,
    };

    console.log(
      `[McpStatusServer] EMITTING: session=${payload.sessionId} status=${payload.state}`
    );

    this.eventEmitter.emit('session.status', event);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
  }

  /**
   * Register a session for status updates
   * @param sessionId Session identifier
   * @param projectPath Project path for routing
   */
  registerSession(sessionId: string, projectPath: string): void {
    this.sessionProjects.set(sessionId, projectPath);
    console.log(
      `[McpStatusServer] Registered session ${sessionId} for project '${projectPath}'`
    );
  }

  /**
   * Unregister a session when it ends
   * @param sessionId Session identifier
   */
  unregisterSession(sessionId: string): void {
    if (this.sessionProjects.delete(sessionId)) {
      console.log(`[McpStatusServer] Unregistered session ${sessionId}`);
    }
  }

  /**
   * Get the status URL for MCP servers to report to
   * @returns Status URL or null if server not running
   */
  getStatusUrl(): string | null {
    if (!this.port) {
      return null;
    }
    return `http://127.0.0.1:${this.port}/status`;
  }

  /**
   * Get the unique instance ID for this Omniscribe instance
   * @returns Instance UUID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Check if the status server is running
   * @returns True if server is running
   */
  isRunning(): boolean {
    return this.port !== null;
  }

  /**
   * Get the port the server is listening on
   * @returns Port number or null if not running
   */
  getPort(): number | null {
    return this.port;
  }
}
