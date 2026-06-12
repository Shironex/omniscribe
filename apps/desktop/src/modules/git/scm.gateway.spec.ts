import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server } from 'socket.io';
import { ScmGateway } from './scm.gateway';
import { ScmService, ScmError } from './scm.service';

function createMockServer(): { server: Server; toEmit: jest.Mock; to: jest.Mock } {
  const toEmit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit: toEmit });
  const server = { emit: jest.fn(), to } as unknown as Server;
  return { server, toEmit, to };
}

const mockScm = {
  panelSnapshot: jest.fn(),
  stage: jest.fn(),
  unstage: jest.fn(),
  discard: jest.fn(),
  stageHunk: jest.fn(),
  unstageHunk: jest.fn(),
  commit: jest.fn(),
  fetch: jest.fn(),
  pull: jest.fn(),
  push: jest.fn(),
  log: jest.fn(),
  showCommit: jest.fn(),
  commitFileDiff: jest.fn(),
  fileDiff: jest.fn(),
};

describe('ScmGateway', () => {
  let gateway: ScmGateway;
  let toEmit: jest.Mock;
  let to: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [ScmGateway, { provide: ScmService, useValue: mockScm }],
    }).compile();

    gateway = module.get<ScmGateway>(ScmGateway);
    const mock = createMockServer();
    gateway.server = mock.server;
    toEmit = mock.toEmit;
    to = mock.to;
  });

  // ========================================================================
  // Path validation
  // ========================================================================

  describe('path validation', () => {
    it('rejects a relative projectPath on a query', async () => {
      const res = await gateway.handlePanelSnapshot({ projectPath: 'relative' });
      expect(res.error).toBe('Invalid projectPath: must be an absolute path');
      expect(res.errorCode).toBe('INVALID_PATH');
      expect(mockScm.panelSnapshot).not.toHaveBeenCalled();
    });

    it('rejects a relative projectPath on a mutation and does not broadcast', async () => {
      const res = await gateway.handleStage({ projectPath: 'relative', paths: ['a.ts'] });
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('INVALID_PATH');
      expect(mockScm.stage).not.toHaveBeenCalled();
      expect(toEmit).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Queries
  // ========================================================================

  describe('handlePanelSnapshot', () => {
    it('returns the service snapshot', async () => {
      const snap = {
        isRepo: true,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        isMerging: false,
        isRebasing: false,
      };
      mockScm.panelSnapshot.mockResolvedValue(snap);

      const res = await gateway.handlePanelSnapshot({ projectPath: '/repo' });

      expect(mockScm.panelSnapshot).toHaveBeenCalledWith('/repo');
      expect(res).toBe(snap);
    });

    it('STATUS aliases PANEL_SNAPSHOT', async () => {
      mockScm.panelSnapshot.mockResolvedValue({ isRepo: false });
      await gateway.handleStatus({ projectPath: '/repo' });
      expect(mockScm.panelSnapshot).toHaveBeenCalledWith('/repo');
    });
  });

  describe('handleLog', () => {
    it('forwards limit + beforeSha and returns the page', async () => {
      mockScm.log.mockResolvedValue({ commits: [{ hash: 'h1' }], nextBeforeSha: 'h0' });

      const res = await gateway.handleLog({ projectPath: '/repo', limit: 10, beforeSha: 'h2' });

      expect(mockScm.log).toHaveBeenCalledWith('/repo', { limit: 10, beforeSha: 'h2' });
      expect(res.commits).toHaveLength(1);
      expect(res.nextBeforeSha).toBe('h0');
    });
  });

  // ========================================================================
  // Mutations broadcast scm:changed
  // ========================================================================

  describe('mutations broadcast scm:changed', () => {
    it('stage broadcasts to the project git room on success', async () => {
      mockScm.stage.mockResolvedValue(undefined);

      const res = await gateway.handleStage({ projectPath: '/repo', paths: ['a.ts'] });

      expect(res.success).toBe(true);
      expect(to).toHaveBeenCalledWith('git:/repo');
      expect(toEmit).toHaveBeenCalledWith('scm:changed', { projectPath: '/repo' });
    });

    it('commit returns the hash and broadcasts', async () => {
      mockScm.commit.mockResolvedValue('a'.repeat(40));

      const res = await gateway.handleCommit({ projectPath: '/repo', message: 'msg' });

      expect(res.success).toBe(true);
      expect(res.hash).toBe('a'.repeat(40));
      expect(toEmit).toHaveBeenCalledWith('scm:changed', { projectPath: '/repo' });
    });

    it('does not broadcast when a mutation throws a typed error', async () => {
      mockScm.commit.mockRejectedValue(new ScmError('NOTHING_TO_COMMIT', 'Nothing to commit'));

      const res = await gateway.handleCommit({ projectPath: '/repo', message: 'msg' });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('NOTHING_TO_COMMIT');
      expect(res.error).toBe('Nothing to commit');
      expect(toEmit).not.toHaveBeenCalled();
    });

    it('maps an unexpected error to GIT_ERROR', async () => {
      mockScm.stage.mockRejectedValue(new Error('boom'));

      const res = await gateway.handleStage({ projectPath: '/repo', paths: ['a.ts'] });

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('GIT_ERROR');
      expect(res.error).toBe('boom');
      expect(toEmit).not.toHaveBeenCalled();
    });

    it.each([
      ['unstage', 'handleUnstage', 'unstage'],
      ['discard', 'handleDiscard', 'discard'],
    ])('%s broadcasts on success', async (_label, handler, method) => {
      (mockScm as Record<string, jest.Mock>)[method].mockResolvedValue(undefined);

      const res = await (
        gateway as unknown as Record<string, (p: unknown) => Promise<{ success: boolean }>>
      )[handler]({ projectPath: '/repo', paths: ['a.ts'] });

      expect(res.success).toBe(true);
      expect(toEmit).toHaveBeenCalledWith('scm:changed', { projectPath: '/repo' });
    });

    it('hunk staging broadcasts on success', async () => {
      mockScm.stageHunk.mockResolvedValue(undefined);

      const res = await gateway.handleStageHunk({
        projectPath: '/repo',
        filePath: 'a.ts',
        patch: 'PATCH',
      });

      expect(mockScm.stageHunk).toHaveBeenCalledWith('/repo', 'a.ts', 'PATCH');
      expect(res.success).toBe(true);
      expect(toEmit).toHaveBeenCalledWith('scm:changed', { projectPath: '/repo' });
    });

    it('fetch/pull/push broadcast and surface typed remote errors', async () => {
      mockScm.fetch.mockResolvedValue(undefined);
      const ok = await gateway.handleFetch({ projectPath: '/repo' });
      expect(ok.success).toBe(true);
      expect(toEmit).toHaveBeenCalledWith('scm:changed', { projectPath: '/repo' });

      jest.clearAllMocks();
      mockScm.pull.mockRejectedValue(new ScmError('DIVERGED', 'diverged'));
      const bad = await gateway.handlePull({ projectPath: '/repo' });
      expect(bad.success).toBe(false);
      expect(bad.errorCode).toBe('DIVERGED');
      expect(toEmit).not.toHaveBeenCalled();
    });
  });
});
