import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import { FsEvents } from '@omniscribe/shared';
import type { FsEntry, FsChangedEvent } from '@omniscribe/shared';

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

import { useFsStore } from '../useFsStore';

const PROJECT = '/project';

function entry(overrides: Partial<FsEntry> & Pick<FsEntry, 'name' | 'path' | 'kind'>): FsEntry {
  return { size: 0, mtime: 0, ...overrides };
}

/** Route emitAsync by event name. */
function routeEmit(handlers: Record<string, (payload: unknown) => unknown>) {
  mockEmitAsync.mockImplementation(async (event: string, payload: unknown) => {
    const handler = handlers[event];
    return handler ? handler(payload) : { error: `unhandled ${event}` };
  });
}

const initialState = {
  projectPath: null,
  dirs: {},
  expanded: {},
  requestedOpenFile: null,
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useFsStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useFsStore.setState(initialState);
  });

  afterEach(() => {
    const state = useFsStore.getState();
    if (state.listenersInitialized) state.cleanupListeners();
  });

  describe('initial state', () => {
    it('starts empty', () => {
      const s = useFsStore.getState();
      expect(s.projectPath).toBeNull();
      expect(s.dirs).toEqual({});
      expect(s.expanded).toEqual({});
      expect(s.requestedOpenFile).toBeNull();
    });
  });

  describe('setProject', () => {
    it('loads the root, expands it, and starts watching', async () => {
      const rootEntries: FsEntry[] = [
        entry({ name: 'src', path: '/project/src', kind: 'dir' }),
        entry({ name: 'a.txt', path: '/project/a.txt', kind: 'file' }),
      ];
      routeEmit({
        [FsEvents.READ_DIR]: () => ({ path: PROJECT, entries: rootEntries }),
        [FsEvents.WATCH]: () => ({ success: true, watchId: 'x' }),
      });

      await useFsStore.getState().setProject(PROJECT);

      const s = useFsStore.getState();
      expect(s.projectPath).toBe(PROJECT);
      expect(s.dirs[PROJECT]?.entries).toEqual(rootEntries);
      expect(s.expanded[PROJECT]).toBe(true);
      // watch was requested
      expect(mockEmitAsync).toHaveBeenCalledWith(
        FsEvents.WATCH,
        expect.objectContaining({ projectPath: PROJECT })
      );
    });

    it('stops watching the previous project when switching', async () => {
      routeEmit({
        [FsEvents.READ_DIR]: () => ({ path: PROJECT, entries: [] }),
        [FsEvents.WATCH]: () => ({ success: true }),
        [FsEvents.UNWATCH]: () => ({ success: true }),
      });

      await useFsStore.getState().setProject(PROJECT);
      mockEmitAsync.mockClear();
      await useFsStore.getState().setProject('/other');

      expect(mockEmitAsync).toHaveBeenCalledWith(
        FsEvents.UNWATCH,
        expect.objectContaining({ projectPath: PROJECT })
      );
    });
  });

  describe('loadDir', () => {
    it('stores entries and clears loading on success', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      const dirEntries: FsEntry[] = [
        entry({ name: 'index.ts', path: '/project/src/index.ts', kind: 'file' }),
      ];
      routeEmit({ [FsEvents.READ_DIR]: () => ({ entries: dirEntries }) });

      await useFsStore.getState().loadDir('/project/src');

      const node = useFsStore.getState().dirs['/project/src'];
      expect(node?.loading).toBe(false);
      expect(node?.entries).toEqual(dirEntries);
      expect(node?.error).toBeUndefined();
    });

    it('records an error response without entries', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      routeEmit({ [FsEvents.READ_DIR]: () => ({ error: 'EACCES' }) });

      await useFsStore.getState().loadDir('/project/locked');

      const node = useFsStore.getState().dirs['/project/locked'];
      expect(node?.error).toBe('EACCES');
      expect(node?.loading).toBe(false);
    });
  });

  describe('expand / collapse', () => {
    it('expandDir marks expanded and lazily loads children', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      const children: FsEntry[] = [
        entry({ name: 'x.ts', path: '/project/src/x.ts', kind: 'file' }),
      ];
      routeEmit({ [FsEvents.READ_DIR]: () => ({ entries: children }) });

      await useFsStore.getState().expandDir('/project/src');

      expect(useFsStore.getState().expanded['/project/src']).toBe(true);
      expect(useFsStore.getState().dirs['/project/src']?.entries).toEqual(children);
    });

    it('collapseDir removes the expanded flag', () => {
      useFsStore.setState({ expanded: { '/project/src': true } });
      useFsStore.getState().collapseDir('/project/src');
      expect(useFsStore.getState().expanded['/project/src']).toBeUndefined();
    });

    it('toggleDir flips between expanded and collapsed', async () => {
      useFsStore.setState({
        projectPath: PROJECT,
        dirs: { '/project/src': { entries: [], loading: false } },
      });
      routeEmit({ [FsEvents.READ_DIR]: () => ({ entries: [] }) });

      await useFsStore.getState().toggleDir('/project/src');
      expect(useFsStore.getState().expanded['/project/src']).toBe(true);

      await useFsStore.getState().toggleDir('/project/src');
      expect(useFsStore.getState().expanded['/project/src']).toBeUndefined();
    });
  });

  describe('mutations', () => {
    it('createFile reloads the parent and returns the path', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      routeEmit({
        [FsEvents.CREATE_FILE]: () => ({ success: true, path: '/project/src/new.ts' }),
        [FsEvents.READ_DIR]: () => ({ entries: [] }),
      });

      const created = await useFsStore.getState().createFile('/project/src', 'new.ts');
      expect(created).toBe('/project/src/new.ts');
      expect(mockEmitAsync).toHaveBeenCalledWith(
        FsEvents.CREATE_FILE,
        expect.objectContaining({ projectPath: PROJECT, target: '/project/src/new.ts' })
      );
    });

    it('createFile surfaces an error and returns null on failure', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      routeEmit({ [FsEvents.CREATE_FILE]: () => ({ success: false, error: 'exists' }) });

      const created = await useFsStore.getState().createFile('/project/src', 'dup.ts');
      expect(created).toBeNull();
      expect(useFsStore.getState().error).toBe('exists');
    });

    it('rename reloads both parents on success', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      const seen: string[] = [];
      routeEmit({
        [FsEvents.RENAME]: () => ({ success: true, path: '/project/dst/b.ts' }),
        [FsEvents.READ_DIR]: (payload: unknown) => {
          seen.push((payload as { target: string }).target);
          return { entries: [] };
        },
      });

      const ok = await useFsStore.getState().rename('/project/src/a.ts', '/project/dst/b.ts');
      expect(ok).toBe(true);
      expect(seen).toContain('/project/src');
      expect(seen).toContain('/project/dst');
    });

    it('deletePath reloads the parent on success', async () => {
      useFsStore.setState({ projectPath: PROJECT });
      const seen: string[] = [];
      routeEmit({
        [FsEvents.DELETE]: () => ({ success: true, path: '/project/src/a.ts' }),
        [FsEvents.READ_DIR]: (payload: unknown) => {
          seen.push((payload as { target: string }).target);
          return { entries: [] };
        },
      });

      const ok = await useFsStore.getState().deletePath('/project/src/a.ts');
      expect(ok).toBe(true);
      expect(seen).toContain('/project/src');
    });
  });

  describe('openFile slot', () => {
    it('records and clears the requested-open file', () => {
      useFsStore.getState().openFile('/project/a.ts');
      expect(useFsStore.getState().requestedOpenFile).toBe('/project/a.ts');
      useFsStore.getState().clearRequestedOpen();
      expect(useFsStore.getState().requestedOpenFile).toBeNull();
    });
  });

  describe('fs:changed listener', () => {
    it('reloads loaded directories that own a changed path', async () => {
      useFsStore.setState({
        projectPath: PROJECT,
        dirs: { '/project/src': { entries: [], loading: false } },
      });

      const reloaded: string[] = [];
      routeEmit({
        [FsEvents.READ_DIR]: (payload: unknown) => {
          reloaded.push((payload as { target: string }).target);
          return { entries: [] };
        },
      });

      useFsStore.getState().initListeners();
      const event: FsChangedEvent = {
        projectPath: PROJECT,
        paths: ['/project/src/changed.ts'],
      };
      mockSocket.__simulateEvent(FsEvents.CHANGED, event);

      // loadDir is async; flush microtasks.
      await Promise.resolve();
      expect(reloaded).toContain('/project/src');
    });

    it('ignores changes for a different project', async () => {
      useFsStore.setState({
        projectPath: PROJECT,
        dirs: { '/project/src': { entries: [], loading: false } },
      });
      routeEmit({ [FsEvents.READ_DIR]: () => ({ entries: [] }) });

      useFsStore.getState().initListeners();
      mockSocket.__simulateEvent(FsEvents.CHANGED, {
        projectPath: '/elsewhere',
        paths: ['/elsewhere/x.ts'],
      } satisfies FsChangedEvent);

      await Promise.resolve();
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });
  });
});
