import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Server } from 'socket.io';
import {
  ScmEvents,
  createLogger,
  extractErrorMessage,
  type ScmCommitPayload,
  type ScmCommitResponse,
  type ScmCommitFileDiffPayload,
  type ScmDiffResponse,
  type ScmFileDiffPayload,
  type ScmHunkPayload,
  type ScmLogPayload,
  type ScmLogResponse,
  type ScmMutationResponse,
  type ScmPanelSnapshotPayload,
  type ScmPanelSnapshotResponse,
  type ScmRemotePayload,
  type ScmRemoteResponse,
  type ScmShowCommitPayload,
  type ScmShowCommitResponse,
  type ScmStagePayload,
  type ScmErrorCode,
} from '@omniscribe/shared';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { validatePath } from '../shared/validation';
import { CORS_CONFIG } from '../shared/cors.config';
import { ScmService, ScmError } from './scm.service';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class ScmGateway implements OnGatewayInit {
  private readonly logger = createLogger('ScmGateway');

  @WebSocketServer()
  server!: Server;

  constructor(private readonly scm: ScmService) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  // ==================== Queries ====================

  @SkipThrottle()
  @SubscribeMessage(ScmEvents.PANEL_SNAPSHOT)
  async handlePanelSnapshot(
    @MessageBody() payload: ScmPanelSnapshotPayload
  ): Promise<ScmPanelSnapshotResponse> {
    return this.run<ScmPanelSnapshotResponse>(
      '[scm:panel-snapshot]',
      payload,
      {
        isRepo: false,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        isMerging: false,
        isRebasing: false,
      },
      projectPath => this.scm.panelSnapshot(projectPath)
    );
  }

  // STATUS is an alias of PANEL_SNAPSHOT for clients that only want the
  // lighter status surface; both resolve to the same batched snapshot.
  @SkipThrottle()
  @SubscribeMessage(ScmEvents.STATUS)
  async handleStatus(
    @MessageBody() payload: ScmPanelSnapshotPayload
  ): Promise<ScmPanelSnapshotResponse> {
    return this.handlePanelSnapshot(payload);
  }

  @SkipThrottle()
  @SubscribeMessage(ScmEvents.LOG)
  async handleLog(@MessageBody() payload: ScmLogPayload): Promise<ScmLogResponse> {
    return this.run<ScmLogResponse>('[scm:log]', payload, { commits: [] }, async projectPath => {
      const { commits, nextBeforeSha } = await this.scm.log(projectPath, {
        limit: payload.limit,
        beforeSha: payload.beforeSha,
      });
      return { commits, nextBeforeSha };
    });
  }

  @SkipThrottle()
  @SubscribeMessage(ScmEvents.SHOW_COMMIT)
  async handleShowCommit(
    @MessageBody() payload: ScmShowCommitPayload
  ): Promise<ScmShowCommitResponse> {
    return this.run<ScmShowCommitResponse>(
      '[scm:show-commit]',
      payload,
      { hash: payload.sha, files: [] },
      projectPath => this.scm.showCommit(projectPath, payload.sha)
    );
  }

  @SkipThrottle()
  @SubscribeMessage(ScmEvents.COMMIT_FILE_DIFF)
  async handleCommitFileDiff(
    @MessageBody() payload: ScmCommitFileDiffPayload
  ): Promise<ScmDiffResponse> {
    return this.run<ScmDiffResponse>('[scm:commit-file-diff]', payload, {}, projectPath =>
      this.scm.commitFileDiff(projectPath, payload.sha, payload.path)
    );
  }

  @SkipThrottle()
  @SubscribeMessage(ScmEvents.FILE_DIFF)
  async handleFileDiff(@MessageBody() payload: ScmFileDiffPayload): Promise<ScmDiffResponse> {
    return this.run<ScmDiffResponse>('[scm:file-diff]', payload, {}, projectPath =>
      this.scm.fileDiff(projectPath, payload.path, { staged: payload.staged })
    );
  }

  // ==================== Mutations (broadcast scm:changed) ====================

  @SubscribeMessage(ScmEvents.STAGE)
  async handleStage(@MessageBody() payload: ScmStagePayload): Promise<ScmMutationResponse> {
    return this.mutate('[scm:stage]', payload, async projectPath => {
      await this.scm.stage(projectPath, payload.paths);
    });
  }

  @SubscribeMessage(ScmEvents.UNSTAGE)
  async handleUnstage(@MessageBody() payload: ScmStagePayload): Promise<ScmMutationResponse> {
    return this.mutate('[scm:unstage]', payload, async projectPath => {
      await this.scm.unstage(projectPath, payload.paths);
    });
  }

  @SubscribeMessage(ScmEvents.DISCARD)
  async handleDiscard(@MessageBody() payload: ScmStagePayload): Promise<ScmMutationResponse> {
    return this.mutate('[scm:discard]', payload, async projectPath => {
      await this.scm.discard(projectPath, payload.paths);
    });
  }

  @SubscribeMessage(ScmEvents.STAGE_HUNK)
  async handleStageHunk(@MessageBody() payload: ScmHunkPayload): Promise<ScmMutationResponse> {
    return this.mutate('[scm:stage-hunk]', payload, async projectPath => {
      await this.scm.stageHunk(projectPath, payload.filePath, payload.patch);
    });
  }

  @SubscribeMessage(ScmEvents.UNSTAGE_HUNK)
  async handleUnstageHunk(@MessageBody() payload: ScmHunkPayload): Promise<ScmMutationResponse> {
    return this.mutate('[scm:unstage-hunk]', payload, async projectPath => {
      await this.scm.unstageHunk(projectPath, payload.filePath, payload.patch);
    });
  }

  @SubscribeMessage(ScmEvents.COMMIT)
  async handleCommit(@MessageBody() payload: ScmCommitPayload): Promise<ScmCommitResponse> {
    const { result, mutated } = await this.tryMutate<ScmCommitResponse>(
      '[scm:commit]',
      payload,
      async projectPath => {
        const hash = await this.scm.commit(projectPath, payload.message, {
          amend: payload.amend,
        });
        return { success: true, hash };
      },
      { success: false }
    );
    if (mutated) this.broadcastChanged(payload.projectPath);
    return result;
  }

  @SubscribeMessage(ScmEvents.FETCH)
  async handleFetch(@MessageBody() payload: ScmRemotePayload): Promise<ScmRemoteResponse> {
    return this.mutateRemote('[scm:fetch]', payload, projectPath =>
      this.scm.fetch(projectPath, payload.remote)
    );
  }

  @SubscribeMessage(ScmEvents.PULL)
  async handlePull(@MessageBody() payload: ScmRemotePayload): Promise<ScmRemoteResponse> {
    return this.mutateRemote('[scm:pull]', payload, projectPath =>
      this.scm.pull(projectPath, payload.remote)
    );
  }

  @SubscribeMessage(ScmEvents.PUSH)
  async handlePush(@MessageBody() payload: ScmRemotePayload): Promise<ScmRemoteResponse> {
    return this.mutateRemote('[scm:push]', payload, projectPath =>
      this.scm.push(projectPath, payload.remote)
    );
  }

  // ==================== Internals ====================

  /** Broadcast scm:changed to all clients watching this project's git room. */
  private broadcastChanged(projectPath: string): void {
    this.server.to(`git:${projectPath}`).emit(ScmEvents.CHANGED, { projectPath });
  }

  /**
   * Run a query handler with path validation and typed-error mapping.
   * Returns `defaultResult` merged with `{ error, errorCode }` on failure.
   */
  private async run<TResponse extends { error?: string; errorCode?: ScmErrorCode }>(
    action: string,
    payload: { projectPath: string },
    defaultResult: Omit<TResponse, 'error' | 'errorCode'>,
    handler: (projectPath: string) => Promise<TResponse>
  ): Promise<TResponse> {
    this.logger.debug(`${action} projectPath=${payload.projectPath}`);
    const pathError = validatePath(payload.projectPath);
    if (pathError) {
      return { ...defaultResult, error: pathError, errorCode: 'INVALID_PATH' } as TResponse;
    }
    try {
      return await handler(payload.projectPath);
    } catch (error) {
      return { ...defaultResult, ...this.toError(action, error) } as TResponse;
    }
  }

  /**
   * Run a mutation, broadcasting scm:changed on success. Returns a
   * SuccessResponse-shaped result with typed error code on failure.
   */
  private async mutate(
    action: string,
    payload: { projectPath: string },
    handler: (projectPath: string) => Promise<void>
  ): Promise<ScmMutationResponse> {
    const { result, mutated } = await this.tryMutate<ScmMutationResponse>(
      action,
      payload,
      async projectPath => {
        await handler(projectPath);
        return { success: true };
      },
      { success: false }
    );
    if (mutated) this.broadcastChanged(payload.projectPath);
    return result;
  }

  private async mutateRemote(
    action: string,
    payload: { projectPath: string },
    handler: (projectPath: string) => Promise<void>
  ): Promise<ScmRemoteResponse> {
    return this.mutate(action, payload, handler);
  }

  /**
   * Core mutate runner: validates the path, runs the handler, and reports
   * whether a state-changing operation actually completed (so the caller can
   * decide whether to broadcast). Path/validation failures never broadcast.
   */
  private async tryMutate<
    TResponse extends { success: boolean; error?: string; errorCode?: ScmErrorCode },
  >(
    action: string,
    payload: { projectPath: string },
    handler: (projectPath: string) => Promise<TResponse>,
    failureResult: Omit<TResponse, 'error' | 'errorCode'>
  ): Promise<{ result: TResponse; mutated: boolean }> {
    this.logger.debug(`${action} projectPath=${payload.projectPath}`);
    const pathError = validatePath(payload.projectPath);
    if (pathError) {
      return {
        result: { ...failureResult, error: pathError, errorCode: 'INVALID_PATH' } as TResponse,
        mutated: false,
      };
    }
    try {
      const result = await handler(payload.projectPath);
      return { result, mutated: result.success === true };
    } catch (error) {
      return {
        result: { ...failureResult, ...this.toError(action, error) } as TResponse,
        mutated: false,
      };
    }
  }

  /** Map a thrown error to `{ error, errorCode }`, logging it. */
  private toError(action: string, error: unknown): { error: string; errorCode: ScmErrorCode } {
    this.logger.error(`Error ${action}:`, error);
    if (error instanceof ScmError) {
      return { error: error.message, errorCode: error.code };
    }
    return { error: extractErrorMessage(error, 'Unknown error'), errorCode: 'GIT_ERROR' };
  }
}
