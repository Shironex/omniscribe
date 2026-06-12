import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import { FsEvents } from '@omniscribe/shared';
import type { FsChangedEvent } from '@omniscribe/shared';

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

import { useEditorStore } from '../useEditorStore';
import { useFsStore } from '../useFsStore';

const PROJECT = '/project';
const FILE = '/project/src/a.ts';

/** Route emitAsync by event name. */
function routeEmit(handlers: Record<string, (payload: unknown) => unknown>) {
  mockEmitAsync.mockImplementation(async (event: string, payload: unknown) => {
    const handler = handlers[event];
    return handler ? handler(payload) : { error: `unhandled ${event}` };
  });
}

const initialEditorState = {
  projectPath: null,
  files: [],
  activePath: null,
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

describe('useEditorStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    // Reset the FS store too so its module-scope subscription can't leak across tests.
    useFsStore.setState({ projectPath: null, requestedOpenFile: null });
    useEditorStore.setState(initialEditorState);
  });

  afterEach(() => {
    const state = useEditorStore.getState();
    if (state.listenersInitialized) state.cleanupListeners();
  });

  describe('initial state', () => {
    it('starts with no open files', () => {
      const s = useEditorStore.getState();
      expect(s.files).toEqual([]);
      expect(s.activePath).toBeNull();
      expect(s.projectPath).toBeNull();
    });
  });

  describe('openFile', () => {
    it('reads content, focuses the new tab, and starts clean', async () => {
      routeEmit({
        [FsEvents.READ_FILE]: () => ({ path: FILE, content: 'hello', size: 5 }),
      });

      await useEditorStore.getState().openFile(PROJECT, FILE);

      const s = useEditorStore.getState();
      expect(s.files).toHaveLength(1);
      expect(s.activePath).toBe(FILE);
      const file = s.files[0];
      expect(file.content).toBe('hello');
      expect(file.savedContent).toBe('hello');
      expect(file.dirty).toBe(false);
      expect(file.loading).toBe(false);
      expect(mockEmitAsync).toHaveBeenCalledWith(
        FsEvents.READ_FILE,
        expect.objectContaining({ projectPath: PROJECT, target: FILE })
      );
    });

    it('focuses an already-open file instead of re-reading', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'x' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      await useEditorStore.getState().openFile(PROJECT, '/project/b.ts');
      mockEmitAsync.mockClear();

      await useEditorStore.getState().openFile(PROJECT, FILE);

      expect(useEditorStore.getState().activePath).toBe(FILE);
      expect(useEditorStore.getState().files).toHaveLength(2);
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('marks a binary file and renders no content', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ binary: true, size: 1024 }) });

      await useEditorStore.getState().openFile(PROJECT, '/project/logo.png');

      const file = useEditorStore.getState().files[0];
      expect(file.binary).toBe(true);
      expect(file.loading).toBe(false);
    });

    it('marks a too-large file', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ tooLarge: true, size: 9_000_000 }) });

      await useEditorStore.getState().openFile(PROJECT, '/project/huge.log');

      const file = useEditorStore.getState().files[0];
      expect(file.tooLarge).toBe(true);
    });

    it('records a read error on the tab', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ error: 'EACCES' }) });

      await useEditorStore.getState().openFile(PROJECT, '/project/locked.ts');

      const file = useEditorStore.getState().files[0];
      expect(file.error).toBe('EACCES');
      expect(file.loading).toBe(false);
    });

    it('flags `.git/` paths as read-only', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'ref: refs/heads/main' }) });

      await useEditorStore.getState().openFile(PROJECT, '/project/.git/HEAD');

      const file = useEditorStore.getState().files[0];
      expect(file.readOnly).toBe(true);
    });
  });

  describe('setContent / dirty tracking', () => {
    it('flips dirty when content diverges from savedContent', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'a' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);

      useEditorStore.getState().setContent(FILE, 'ab');
      expect(useEditorStore.getState().files[0].dirty).toBe(true);

      // Reverting to saved content clears dirty.
      useEditorStore.getState().setContent(FILE, 'a');
      expect(useEditorStore.getState().files[0].dirty).toBe(false);
    });

    it('ignores edits to read-only files', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'orig' }) });
      await useEditorStore.getState().openFile(PROJECT, '/project/.git/config');

      useEditorStore.getState().setContent('/project/.git/config', 'tampered');

      const file = useEditorStore.getState().files[0];
      expect(file.content).toBe('orig');
      expect(file.dirty).toBe(false);
    });
  });

  describe('save', () => {
    it('writes content and clears dirty', async () => {
      routeEmit({
        [FsEvents.READ_FILE]: () => ({ content: 'a' }),
        [FsEvents.WRITE_FILE]: () => ({ success: true, path: FILE }),
      });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setContent(FILE, 'a-edited');

      const ok = await useEditorStore.getState().save(FILE);

      expect(ok).toBe(true);
      const file = useEditorStore.getState().files[0];
      expect(file.dirty).toBe(false);
      expect(file.savedContent).toBe('a-edited');
      expect(mockEmitAsync).toHaveBeenCalledWith(
        FsEvents.WRITE_FILE,
        expect.objectContaining({ projectPath: PROJECT, target: FILE, content: 'a-edited' })
      );
    });

    it('surfaces a write error and keeps the file dirty', async () => {
      routeEmit({
        [FsEvents.READ_FILE]: () => ({ content: 'a' }),
        [FsEvents.WRITE_FILE]: () => ({ success: false, error: 'EROFS' }),
      });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setContent(FILE, 'a-edited');

      const ok = await useEditorStore.getState().save(FILE);

      expect(ok).toBe(false);
      const file = useEditorStore.getState().files[0];
      expect(file.dirty).toBe(true);
      expect(file.error).toBe('EROFS');
    });

    it('is a no-op for a clean file and never writes', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'a' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      mockEmitAsync.mockClear();

      const ok = await useEditorStore.getState().save(FILE);

      expect(ok).toBe(true);
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('refuses to save read-only files', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'a' }) });
      await useEditorStore.getState().openFile(PROJECT, '/project/.git/HEAD');
      mockEmitAsync.mockClear();

      const ok = await useEditorStore.getState().save('/project/.git/HEAD');

      expect(ok).toBe(false);
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('saveAll writes every dirty writable file', async () => {
      const written: string[] = [];
      routeEmit({
        [FsEvents.READ_FILE]: () => ({ content: 'a' }),
        [FsEvents.WRITE_FILE]: (payload: unknown) => {
          written.push((payload as { target: string }).target);
          return { success: true };
        },
      });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      await useEditorStore.getState().openFile(PROJECT, '/project/b.ts');
      useEditorStore.getState().setContent(FILE, 'a-edited');
      useEditorStore.getState().setContent('/project/b.ts', 'b-edited');

      await useEditorStore.getState().saveAll();

      expect(written).toContain(FILE);
      expect(written).toContain('/project/b.ts');
      expect(useEditorStore.getState().files.every(f => !f.dirty)).toBe(true);
    });
  });

  describe('closeFile', () => {
    it('removes the tab and focuses a neighbor', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'x' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      await useEditorStore.getState().openFile(PROJECT, '/project/b.ts');

      // Active is /project/b.ts (last opened). Close it → focus the neighbor.
      useEditorStore.getState().closeFile('/project/b.ts');

      const s = useEditorStore.getState();
      expect(s.files).toHaveLength(1);
      expect(s.activePath).toBe(FILE);
    });

    it('clears activePath when the last file closes', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'x' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);

      useEditorStore.getState().closeFile(FILE);

      expect(useEditorStore.getState().files).toHaveLength(0);
      expect(useEditorStore.getState().activePath).toBeNull();
    });
  });

  describe('external change reconciliation', () => {
    it('silently reloads a clean open file when it changes on disk', async () => {
      // First read on open, then the listener re-reads with new content.
      let reads = 0;
      routeEmit({
        [FsEvents.READ_FILE]: () => {
          reads += 1;
          return { content: reads === 1 ? 'v1' : 'v2' };
        },
      });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setProject(PROJECT);
      useEditorStore.getState().initListeners();

      const evt: FsChangedEvent = { projectPath: PROJECT, paths: [FILE] };
      mockSocket.__simulateEvent(FsEvents.CHANGED, evt);
      // listener -> async re-read -> setState
      await Promise.resolve();
      await Promise.resolve();

      const file = useEditorStore.getState().files[0];
      expect(file.content).toBe('v2');
      expect(file.savedContent).toBe('v2');
      expect(file.dirty).toBe(false);
      expect(file.externallyChanged).toBeFalsy();
    });

    it('raises the externally-changed banner when the buffer is dirty', async () => {
      let reads = 0;
      routeEmit({
        [FsEvents.READ_FILE]: () => {
          reads += 1;
          return { content: reads === 1 ? 'v1' : 'disk-v2' };
        },
      });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setProject(PROJECT);
      useEditorStore.getState().setContent(FILE, 'my-edits');
      useEditorStore.getState().initListeners();

      mockSocket.__simulateEvent(FsEvents.CHANGED, {
        projectPath: PROJECT,
        paths: [FILE],
      } satisfies FsChangedEvent);
      await Promise.resolve();
      await Promise.resolve();

      const file = useEditorStore.getState().files[0];
      expect(file.externallyChanged).toBe(true);
      expect(file.externalContent).toBe('disk-v2');
      // Buffer is preserved.
      expect(file.content).toBe('my-edits');
      expect(file.dirty).toBe(true);
    });

    it('reloadFromDisk takes the disk content and clears dirty', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'v1' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setContent(FILE, 'my-edits');
      useEditorStore.getState().markExternallyChanged(FILE, 'disk-v2');

      useEditorStore.getState().reloadFromDisk(FILE);

      const file = useEditorStore.getState().files[0];
      expect(file.content).toBe('disk-v2');
      expect(file.savedContent).toBe('disk-v2');
      expect(file.dirty).toBe(false);
      expect(file.externallyChanged).toBe(false);
    });

    it('keepLocal dismisses the banner and keeps edits', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'v1' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setContent(FILE, 'my-edits');
      useEditorStore.getState().markExternallyChanged(FILE, 'disk-v2');

      useEditorStore.getState().keepLocal(FILE);

      const file = useEditorStore.getState().files[0];
      expect(file.externallyChanged).toBe(false);
      expect(file.content).toBe('my-edits');
      expect(file.dirty).toBe(true);
    });

    it('ignores fs:changed for a different project', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'v1' }) });
      await useEditorStore.getState().openFile(PROJECT, FILE);
      useEditorStore.getState().setProject(PROJECT);
      useEditorStore.getState().initListeners();
      mockEmitAsync.mockClear();

      mockSocket.__simulateEvent(FsEvents.CHANGED, {
        projectPath: '/elsewhere',
        paths: ['/elsewhere/x.ts'],
      } satisfies FsChangedEvent);
      await Promise.resolve();

      expect(mockEmitAsync).not.toHaveBeenCalled();
    });
  });

  describe('explorer open-file subscription', () => {
    it('opens the file the explorer requested', async () => {
      routeEmit({ [FsEvents.READ_FILE]: () => ({ content: 'from-explorer' }) });

      // Simulate the explorer recording a requested-open path.
      useFsStore.setState({ projectPath: PROJECT });
      useFsStore.getState().openFile(FILE);

      // Subscription -> setProject + openFile (async). Flush.
      await Promise.resolve();
      await Promise.resolve();

      const s = useEditorStore.getState();
      expect(s.files.some(f => f.path === FILE)).toBe(true);
      // The one-shot slot is cleared after consumption.
      expect(useFsStore.getState().requestedOpenFile).toBeNull();
    });
  });
});
