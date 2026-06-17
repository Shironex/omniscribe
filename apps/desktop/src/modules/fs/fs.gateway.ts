import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import {
  FsEvents,
  createLogger,
  extractErrorMessage,
  type FsReadDirPayload,
  type FsReadDirResponse,
  type FsStatPayload,
  type FsStatResponse,
  type FsReadFilePayload,
  type FsReadFileResponse,
  type FsWriteFilePayload,
  type FsCreateFilePayload,
  type FsCreateDirPayload,
  type FsRenamePayload,
  type FsDeletePayload,
  type FsMutateResponse,
  type FsSearchPayload,
  type FsSearchResponse,
  type FsGrepPayload,
  type FsGrepResponse,
  type FsWatchPayload,
  type FsUnwatchPayload,
  type FsWatchResponse,
  type FsChangedEvent,
} from '@omniscribe/shared';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { validatePath } from '../shared/validation';
import { CORS_CONFIG } from '../shared/cors.config';
import { InternalFsEvents } from '../shared/events';
import { FsService } from './fs.service';
import { FsWatchService } from './fs-watch.service';
import { FsPathError } from './fs-paths';

/** Socket.io room a client joins to receive a project's fs:changed broadcasts. */
function fsRoom(projectPath: string): string {
  return `fs:${projectPath}`;
}

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class FsGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = createLogger('FsGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly fsService: FsService,
    private readonly fsWatchService: FsWatchService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
    // Release every watcher subscription owned by this client so refcounts
    // drop and idle native watchers are torn down.
    this.fsWatchService.removeClient(client.id);
  }

  // ---------------------------------------------------------------------------
  // Read operations
  // ---------------------------------------------------------------------------

  @SkipThrottle()
  @SubscribeMessage(FsEvents.READ_DIR)
  async handleReadDir(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsReadDirPayload
  ): Promise<FsReadDirResponse> {
    return this.guard('[fs:read-dir]', payload, async () => {
      const result = await this.fsService.readDir(payload.projectPath, payload.target);
      return { path: result.path, entries: result.entries };
    });
  }

  @SkipThrottle()
  @SubscribeMessage(FsEvents.STAT)
  async handleStat(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsStatPayload
  ): Promise<FsStatResponse> {
    return this.guard('[fs:stat]', payload, async () => {
      const entry = await this.fsService.stat(payload.projectPath, payload.target);
      return { entry };
    });
  }

  @SkipThrottle()
  @SubscribeMessage(FsEvents.READ_FILE)
  async handleReadFile(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsReadFilePayload
  ): Promise<FsReadFileResponse> {
    return this.guard('[fs:read-file]', payload, async () =>
      this.fsService.readFile(payload.projectPath, payload.target)
    );
  }

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  @SubscribeMessage(FsEvents.WRITE_FILE)
  async handleWriteFile(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsWriteFilePayload
  ): Promise<FsMutateResponse> {
    return this.guardMutation('[fs:write-file]', payload, async () => {
      const resolved = await this.fsService.writeFile(
        payload.projectPath,
        payload.target,
        payload.content ?? ''
      );
      return { success: true, path: resolved };
    });
  }

  @SubscribeMessage(FsEvents.CREATE_FILE)
  async handleCreateFile(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsCreateFilePayload
  ): Promise<FsMutateResponse> {
    return this.guardMutation('[fs:create-file]', payload, async () => {
      const resolved = await this.fsService.createFile(payload.projectPath, payload.target);
      return { success: true, path: resolved };
    });
  }

  @SubscribeMessage(FsEvents.CREATE_DIR)
  async handleCreateDir(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsCreateDirPayload
  ): Promise<FsMutateResponse> {
    return this.guardMutation('[fs:create-dir]', payload, async () => {
      const resolved = await this.fsService.createDir(payload.projectPath, payload.target);
      return { success: true, path: resolved };
    });
  }

  @SubscribeMessage(FsEvents.RENAME)
  async handleRename(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsRenamePayload
  ): Promise<FsMutateResponse> {
    return this.guardMutation('[fs:rename]', payload, async () => {
      if (!payload.from || !payload.to) {
        return { success: false, error: 'Both from and to are required' };
      }
      const resolved = await this.fsService.rename(payload.projectPath, payload.from, payload.to);
      return { success: true, path: resolved };
    });
  }

  @SubscribeMessage(FsEvents.DELETE)
  async handleDelete(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsDeletePayload
  ): Promise<FsMutateResponse> {
    return this.guardMutation('[fs:delete]', payload, async () => {
      const resolved = await this.fsService.delete(payload.projectPath, payload.target);
      return { success: true, path: resolved };
    });
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  @SkipThrottle()
  @SubscribeMessage(FsEvents.SEARCH)
  async handleSearch(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsSearchPayload
  ): Promise<FsSearchResponse> {
    return this.guard('[fs:search]', payload, async () => {
      const result = await this.fsService.search(
        payload.projectPath,
        payload.query ?? '',
        payload.limit
      );
      return { matches: result.matches, truncated: result.truncated };
    });
  }

  @SkipThrottle()
  @SubscribeMessage(FsEvents.GREP)
  async handleGrep(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: FsGrepPayload
  ): Promise<FsGrepResponse> {
    return this.guard('[fs:grep]', payload, async () => {
      const result = await this.fsService.grep(payload.projectPath, payload.query ?? '', {
        fixedString: payload.fixedString,
        caseInsensitive: payload.caseInsensitive,
        limit: payload.limit,
      });
      return { matches: result.matches, truncated: result.truncated };
    });
  }

  // ---------------------------------------------------------------------------
  // Watching
  // ---------------------------------------------------------------------------

  @SubscribeMessage(FsEvents.WATCH)
  async handleWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: FsWatchPayload
  ): Promise<FsWatchResponse> {
    const result = await this.guardMutation('[fs:watch]', payload, async () => {
      if (!payload.watchId) {
        return { success: false, error: 'watchId is required' };
      }
      const root = this.fsWatchService.watch(client.id, payload.projectPath, payload.watchId);
      client.join(fsRoom(root));
      return { success: true, watchId: payload.watchId };
    });
    return result as FsWatchResponse;
  }

  @SubscribeMessage(FsEvents.UNWATCH)
  async handleUnwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: FsUnwatchPayload
  ): Promise<FsWatchResponse> {
    const result = await this.guardMutation('[fs:unwatch]', payload, async () => {
      if (!payload.watchId) {
        return { success: false, error: 'watchId is required' };
      }
      this.fsWatchService.unwatch(client.id, payload.projectPath, payload.watchId);
      return { success: true, watchId: payload.watchId };
    });
    return result as FsWatchResponse;
  }

  /** Broadcast batched filesystem changes to every client watching the project. */
  @OnEvent(InternalFsEvents.CHANGED)
  handleFsChanged(payload: FsChangedEvent): void {
    this.server.to(fsRoom(payload.projectPath)).emit(FsEvents.CHANGED, payload);
  }

  // ---------------------------------------------------------------------------
  // Shared guard helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate projectPath, run the handler, and translate path-boundary
   * violations / exceptions into a typed `{ error }` response.
   */
  private async guard<TResponse>(
    action: string,
    payload: { projectPath: string },
    handler: () => Promise<TResponse>
  ): Promise<TResponse> {
    this.logger.debug(`${action} projectPath=${payload?.projectPath}`);
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { error: pathError } as TResponse;
    }
    try {
      return await handler();
    } catch (error) {
      const message =
        error instanceof FsPathError
          ? error.message
          : extractErrorMessage(error, 'Filesystem operation failed');
      this.logger.error(`Error ${action}:`, error);
      return { error: message } as TResponse;
    }
  }

  /** Like {@link guard} but for `{ success, error }`-shaped mutation responses. */
  private async guardMutation(
    action: string,
    payload: { projectPath: string },
    handler: () => Promise<FsMutateResponse & { watchId?: string }>
  ): Promise<FsMutateResponse & { watchId?: string }> {
    this.logger.debug(`${action} projectPath=${payload?.projectPath}`);
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { success: false, error: pathError };
    }
    try {
      return await handler();
    } catch (error) {
      const message =
        error instanceof FsPathError
          ? error.message
          : extractErrorMessage(error, 'Filesystem operation failed');
      this.logger.error(`Error ${action}:`, error);
      return { success: false, error: message };
    }
  }
}
