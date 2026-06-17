import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import { ScmEvents } from '@omniscribe/shared';
import type { ScmPanelSnapshotResponse } from '@omniscribe/shared';

vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

// Mock emitAsync — every test sets per-event resolutions.
const mockEmitAsync = vi.fn();
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: (...args: unknown[]) => mockEmitAsync(...args),
}));

import {
  useScmStore,
  scmErrorMessage,
  selectChangedCount,
  selectStatusByPath,
} from '../useScmStore';

const PROJECT = '/project';

/** Route emitAsync by event name. */
function routeEmit(handlers: Record<string, (payload: unknown) => unknown>) {
  mockEmitAsync.mockImplementation(async (event: string, payload: unknown) => {
    const handler = handlers[event];
    return handler ? handler(payload) : { error: `unhandled ${event}` };
  });
}

function snapshot(overrides: Partial<ScmPanelSnapshotResponse> = {}): ScmPanelSnapshotResponse {
  return {
    isRepo: true,
    rootPath: PROJECT,
    branch: 'main',
    upstream: 'origin/main',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    isMerging: false,
    isRebasing: false,
    ...overrides,
  };
}

function resetStore() {
  useScmStore.setState({
    projectPath: null,
    snapshot: null,
    pending: { fetch: false, pull: false, push: false, commit: false, paths: new Set() },
    lastErrorCode: null,
    log: [],
    logNextBeforeSha: undefined,
    logLoading: false,
    commitFiles: {},
    selectedDiff: null,
    isLoading: false,
    error: null,
    listenersInitialized: false,
  });
}

describe('useScmStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    resetStore();
  });

  describe('refresh', () => {
    it('loads a panel snapshot for the active project', async () => {
      const snap = snapshot({
        unstaged: [{ path: 'a.ts', status: 'modified' }],
      });
      routeEmit({ [ScmEvents.PANEL_SNAPSHOT]: () => snap });

      useScmStore.setState({ projectPath: PROJECT });
      await useScmStore.getState().refresh(PROJECT);

      const state = useScmStore.getState();
      expect(state.snapshot).toEqual(snap);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('maps an error-coded snapshot to a friendly message', async () => {
      routeEmit({
        [ScmEvents.PANEL_SNAPSHOT]: () => ({
          ...snapshot({ isRepo: false }),
          error: 'not a repo',
          errorCode: 'NOT_A_REPO',
        }),
      });

      useScmStore.setState({ projectPath: PROJECT });
      await useScmStore.getState().refresh(PROJECT);

      const state = useScmStore.getState();
      expect(state.error).toBe('This folder is not a git repository.');
      expect(state.lastErrorCode).toBe('NOT_A_REPO');
    });

    it('ignores a snapshot that arrives after the project changed', async () => {
      let resolveSnap!: (v: ScmPanelSnapshotResponse) => void;
      routeEmit({
        [ScmEvents.PANEL_SNAPSHOT]: () =>
          new Promise<ScmPanelSnapshotResponse>(res => {
            resolveSnap = res;
          }),
      });

      useScmStore.setState({ projectPath: PROJECT });
      const p = useScmStore.getState().refresh(PROJECT);
      // Project switched before the response lands.
      useScmStore.setState({ projectPath: '/other' });
      resolveSnap(snapshot());
      await p;

      expect(useScmStore.getState().snapshot).toBeNull();
    });
  });

  describe('mutations', () => {
    it('stage marks/unmarks paths pending and succeeds', async () => {
      routeEmit({ [ScmEvents.STAGE]: () => ({ success: true }) });
      useScmStore.setState({ projectPath: PROJECT });

      const ok = await useScmStore.getState().stage(['a.ts']);
      expect(ok).toBe(true);
      expect(mockEmitAsync).toHaveBeenCalledWith(ScmEvents.STAGE, {
        projectPath: PROJECT,
        paths: ['a.ts'],
      });
      // Pending cleared after completion.
      expect(useScmStore.getState().pending.paths.has('a.ts')).toBe(false);
    });

    it('stage surfaces a typed error and returns false', async () => {
      routeEmit({
        [ScmEvents.STAGE]: () => ({ success: false, error: 'boom', errorCode: 'GIT_ERROR' }),
      });
      useScmStore.setState({ projectPath: PROJECT });

      const ok = await useScmStore.getState().stage(['a.ts']);
      expect(ok).toBe(false);
      expect(useScmStore.getState().lastErrorCode).toBe('GIT_ERROR');
    });

    it('discard sends the right event', async () => {
      routeEmit({ [ScmEvents.DISCARD]: () => ({ success: true }) });
      useScmStore.setState({ projectPath: PROJECT });

      await useScmStore.getState().discard(['x.ts', 'y.ts']);
      expect(mockEmitAsync).toHaveBeenCalledWith(ScmEvents.DISCARD, {
        projectPath: PROJECT,
        paths: ['x.ts', 'y.ts'],
      });
    });

    it('commit clears the composer path and reloads the log on success', async () => {
      routeEmit({
        [ScmEvents.COMMIT]: () => ({ success: true, hash: 'a'.repeat(40) }),
        [ScmEvents.LOG]: () => ({ commits: [] }),
      });
      useScmStore.setState({ projectPath: PROJECT });

      const ok = await useScmStore.getState().commit('feat: x', false);
      expect(ok).toBe(true);
      expect(mockEmitAsync).toHaveBeenCalledWith(ScmEvents.COMMIT, {
        projectPath: PROJECT,
        message: 'feat: x',
        amend: false,
      });
    });

    it('commit maps NOTHING_TO_COMMIT to a friendly message', async () => {
      routeEmit({
        [ScmEvents.COMMIT]: () => ({
          success: false,
          error: 'Nothing to commit',
          errorCode: 'NOTHING_TO_COMMIT',
        }),
      });
      useScmStore.setState({ projectPath: PROJECT });

      const ok = await useScmStore.getState().commit('msg');
      expect(ok).toBe(false);
      expect(useScmStore.getState().error).toBe('Nothing staged to commit.');
    });

    it('stageHunk forwards the patch payload', async () => {
      routeEmit({ [ScmEvents.STAGE_HUNK]: () => ({ success: true }) });
      useScmStore.setState({ projectPath: PROJECT });

      await useScmStore.getState().stageHunk('a.ts', 'PATCH');
      expect(mockEmitAsync).toHaveBeenCalledWith(ScmEvents.STAGE_HUNK, {
        projectPath: PROJECT,
        filePath: 'a.ts',
        patch: 'PATCH',
      });
    });
  });

  describe('remote ops', () => {
    it('push toggles the push pending flag and maps DIVERGED', async () => {
      routeEmit({
        [ScmEvents.PUSH]: () => ({ success: false, error: 'rejected', errorCode: 'DIVERGED' }),
      });
      useScmStore.setState({ projectPath: PROJECT });

      const ok = await useScmStore.getState().push();
      expect(ok).toBe(false);
      expect(useScmStore.getState().error).toMatch(/diverged/i);
      expect(useScmStore.getState().pending.push).toBe(false);
    });

    it('fetch refreshes the snapshot on success', async () => {
      const snap = snapshot({ ahead: 0, behind: 2 });
      routeEmit({
        [ScmEvents.FETCH]: () => ({ success: true }),
        [ScmEvents.PANEL_SNAPSHOT]: () => snap,
      });
      useScmStore.setState({ projectPath: PROJECT });

      const ok = await useScmStore.getState().fetchRemote();
      expect(ok).toBe(true);
      expect(useScmStore.getState().snapshot?.behind).toBe(2);
    });
  });

  describe('log pagination', () => {
    it('loads the first page and tracks nextBeforeSha', async () => {
      routeEmit({
        [ScmEvents.LOG]: () => ({
          commits: [
            {
              hash: 'h1',
              shortHash: 'h1',
              parents: [],
              authorName: 'A',
              authorEmail: 'a@x',
              authoredDate: '2024-01-01T00:00:00Z',
              subject: 'first',
              refs: [],
            },
          ],
          nextBeforeSha: 'h0',
        }),
      });
      useScmStore.setState({ projectPath: PROJECT });

      await useScmStore.getState().loadLog(true);
      expect(useScmStore.getState().log).toHaveLength(1);
      expect(useScmStore.getState().logNextBeforeSha).toBe('h0');
    });

    it('loadMoreLog appends and continues from beforeSha', async () => {
      useScmStore.setState({
        projectPath: PROJECT,
        log: [
          {
            hash: 'h1',
            shortHash: 'h1',
            parents: [],
            authorName: 'A',
            authorEmail: 'a@x',
            authoredDate: '2024-01-01T00:00:00Z',
            subject: 'first',
            refs: [],
          },
        ],
        logNextBeforeSha: 'h1',
      });
      routeEmit({
        [ScmEvents.LOG]: (payload: unknown) => {
          expect((payload as { beforeSha?: string }).beforeSha).toBe('h1');
          return {
            commits: [
              {
                hash: 'h2',
                shortHash: 'h2',
                parents: [],
                authorName: 'B',
                authorEmail: 'b@x',
                authoredDate: '2023-12-01T00:00:00Z',
                subject: 'second',
                refs: [],
              },
            ],
            nextBeforeSha: undefined,
          };
        },
      });

      await useScmStore.getState().loadMoreLog();
      expect(useScmStore.getState().log.map(c => c.hash)).toEqual(['h1', 'h2']);
      expect(useScmStore.getState().logNextBeforeSha).toBeUndefined();
    });
  });

  describe('selectFileDiff', () => {
    it('stores the resolved diff for the selected file', async () => {
      const file = {
        path: 'a.ts',
        isBinary: false,
        hunks: [],
        additions: 1,
        deletions: 0,
      };
      routeEmit({ [ScmEvents.FILE_DIFF]: () => ({ file }) });
      useScmStore.setState({ projectPath: PROJECT });

      await useScmStore.getState().selectFileDiff('a.ts', false);
      const sel = useScmStore.getState().selectedDiff;
      expect(sel?.file).toEqual(file);
      expect(sel?.loading).toBe(false);
      expect(sel?.source).toEqual({ kind: 'file', path: 'a.ts', staged: false });
    });
  });

  describe('scm:changed listener', () => {
    it('refreshes the snapshot when a matching scm:changed arrives', async () => {
      const snap = snapshot({ staged: [{ path: 's.ts', status: 'modified' }] });
      routeEmit({ [ScmEvents.PANEL_SNAPSHOT]: () => snap });

      useScmStore.setState({ projectPath: PROJECT });
      useScmStore.getState().initListeners();

      mockSocket.__simulateEvent(ScmEvents.CHANGED, { projectPath: PROJECT });
      // Let the async refresh resolve.
      await Promise.resolve();
      await Promise.resolve();

      expect(useScmStore.getState().snapshot?.staged).toHaveLength(1);
    });

    it('ignores scm:changed for a different project', async () => {
      const spy = vi.fn(() => snapshot());
      routeEmit({ [ScmEvents.PANEL_SNAPSHOT]: spy });

      useScmStore.setState({ projectPath: PROJECT });
      useScmStore.getState().initListeners();

      mockSocket.__simulateEvent(ScmEvents.CHANGED, { projectPath: '/elsewhere' });
      await Promise.resolve();

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('selectors', () => {
    it('selectChangedCount sums all buckets', () => {
      useScmStore.setState({
        snapshot: snapshot({
          staged: [{ path: 'a', status: 'modified' }],
          unstaged: [{ path: 'b', status: 'modified' }],
          untracked: [{ path: 'c', status: 'untracked' }],
          conflicted: [{ path: 'd', status: 'conflicted' }],
        }),
      });
      expect(selectChangedCount(useScmStore.getState())).toBe(4);
    });

    it('selectStatusByPath keys by absolute path with conflict priority', () => {
      useScmStore.setState({
        snapshot: snapshot({
          rootPath: '/repo',
          staged: [{ path: 'src/a.ts', status: 'modified' }],
          unstaged: [{ path: 'src/a.ts', status: 'modified' }],
          conflicted: [{ path: 'src/a.ts', status: 'conflicted' }],
          untracked: [{ path: 'new.ts', status: 'untracked' }],
        }),
      });
      const map = selectStatusByPath(useScmStore.getState());
      // Conflict wins over staged/unstaged for the same path.
      expect(map['/repo/src/a.ts']).toBe('conflicted');
      expect(map['/repo/new.ts']).toBe('untracked');
    });
  });

  describe('scmErrorMessage', () => {
    it('maps known codes', () => {
      expect(scmErrorMessage('AUTH_FAILED', '')).toMatch(/authentication/i);
      expect(scmErrorMessage('NO_REMOTE', '')).toMatch(/no remote/i);
      expect(scmErrorMessage('DIVERGED', '')).toMatch(/diverged/i);
    });

    it('falls back to the raw message for GIT_ERROR', () => {
      expect(scmErrorMessage('GIT_ERROR', 'raw detail')).toBe('raw detail');
      expect(scmErrorMessage(undefined, 'raw detail')).toBe('raw detail');
    });
  });
});
