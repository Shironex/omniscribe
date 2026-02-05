import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as http from 'http';
import * as crypto from 'crypto';
import {
  MCP_STATUS_PORT_START,
  MCP_STATUS_PORT_END,
  LOCALHOST,
  StatusPayload,
  SessionStatusState,
  createLogger,
} from '@omniscribe/shared';
import { McpSessionRegistryService } from './services/mcp-session-registry.service';

/**
 * Session status event emitted for UI updates
 */
export interface SessionStatusEvent {
  sessionId: string;
  status: SessionStatusState;
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
  private readonly logger = createLogger('McpStatusServerService');

  /** Port range for status server */
  private readonly PORT_RANGE_START = MCP_STATUS_PORT_START;
  private readonly PORT_RANGE_END = MCP_STATUS_PORT_END;

  /** HTTP server instance */
  private server: http.Server | null = null;

  /** Port the server is listening on */
  private port: number | null = null;

  /** Unique instance ID for this Omniscribe instance */
  private readonly instanceId: string;

  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => McpSessionRegistryService))
    private readonly sessionRegistry: McpSessionRegistryService
  ) {
    // Generate unique instance ID on startup
    this.instanceId = crypto.randomUUID();
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing...');
    await this.startServer();
    this.logger.log('Initialization complete');
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopServer();
  }

  /**
   * Find an available port in the configured range
   */
  private findAvailablePort(): Promise<number | null> {
    return new Promise(resolve => {
      let currentPort = this.PORT_RANGE_START;

      const tryPort = (): void => {
        if (currentPort > this.PORT_RANGE_END) {
          resolve(null);
          return;
        }

        const testServer = http.createServer();
        const timeout = setTimeout(() => {
          testServer.close();
          currentPort++;
          tryPort();
        }, 1000); // 1 second timeout per port

        testServer.once('error', () => {
          clearTimeout(timeout);
          currentPort++;
          tryPort();
        });
        testServer.once('listening', () => {
          clearTimeout(timeout);
          testServer.close(() => {
            resolve(currentPort);
          });
        });
        testServer.listen(currentPort, LOCALHOST);
      };

      tryPort();
    });
  }

  /**
   * Start the HTTP status server
   */
  private async startServer(): Promise<void> {
    this.logger.log('Finding available port...');
    const availablePort = await this.findAvailablePort();
    this.logger.log(`Found port: ${availablePort}`);

    if (!availablePort) {
      this.logger.error(
        `No available port found in range ${this.PORT_RANGE_START}-${this.PORT_RANGE_END}`
      );
      return;
    }

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.once('error', err => {
        this.logger.error('Server error:', err);
        reject(err);
      });

      this.server!.listen(availablePort, LOCALHOST, () => {
        this.port = availablePort;
        this.logger.log(`Started on http://${LOCALHOST}:${this.port}`);
        this.logger.log(`Instance ID: ${this.instanceId}`);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP status server
   */
  private async stopServer(): Promise<void> {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.logger.log('Stopped');
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

    req.on('data', chunk => {
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
        this.logger.error('Invalid JSON payload:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

    req.on('error', error => {
      this.logger.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    });
  }

  /**
   * Handle a status update from the MCP server
   */
  private handleStatusUpdate(payload: StatusPayload, res: http.ServerResponse): void {
    this.logger.debug(
      `Received: sessionId=${payload.sessionId}, instanceId=${payload.instanceId}, state=${payload.state}`
    );

    // Validate instance ID to prevent cross-instance pollution
    if (payload.instanceId !== this.instanceId) {
      this.logger.debug(
        `REJECTED - wrong instance: expected ${this.instanceId}, got ${payload.instanceId}`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: false, reason: 'instance_mismatch' }));
      return;
    }

    // Check if this session is registered
    const projectPath = this.sessionRegistry.getProjectPath(payload.sessionId);
    if (!projectPath) {
      this.logger.debug(`REJECTED - unknown session ${payload.sessionId}`);
      this.logger.debug(
        `Registered sessions: ${this.sessionRegistry.getRegisteredSessions().join(', ')}`
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

    this.logger.debug(`EMITTING: session=${payload.sessionId} status=${payload.state}`);

    this.eventEmitter.emit('session.status', event);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accepted: true }));
  }

  /**
   * Get the status URL for MCP servers to report to
   * @returns Status URL or null if server not running
   */
  getStatusUrl(): string | null {
    if (!this.port) {
      return null;
    }
    return `http://${LOCALHOST}:${this.port}/status`;
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
