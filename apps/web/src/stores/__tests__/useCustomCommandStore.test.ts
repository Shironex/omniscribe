import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';

vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

const mockEmitAsync = vi.fn();
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: (...args: unknown[]) => mockEmitAsync(...args),
}));

import { useCustomCommandStore, selectCommandsForProject } from '../useCustomCommandStore';
import { CustomCommandEvents, type CustomCommand } from '@omniscribe/shared';

const PROJECT = '/proj/A';

function sample(id = 'cmd-1', overrides: Partial<CustomCommand> = {}): CustomCommand {
  return {
    id,
    label: 'List',
    icon: 'Folder',
    command: 'ls',
    createdAt: '2026-05-08T10:00:00.000Z',
    updatedAt: '2026-05-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('useCustomCommandStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useCustomCommandStore.setState({
      commandsByProject: {},
      loadedProjects: new Set<string>(),
      isLoading: false,
      error: null,
      listenersInitialized: false,
    });
  });

  afterEach(() => {
    const state = useCustomCommandStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  describe('fetchForProject', () => {
    it('caches commands by project path', async () => {
      mockEmitAsync.mockResolvedValue({ commands: [sample()] });

      await useCustomCommandStore.getState().fetchForProject(PROJECT);

      expect(mockEmitAsync).toHaveBeenCalledWith(CustomCommandEvents.LIST, {
        projectPath: PROJECT,
      });
      const state = useCustomCommandStore.getState();
      expect(state.commandsByProject[PROJECT]).toHaveLength(1);
      expect(state.loadedProjects.has(PROJECT)).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('records server error', async () => {
      mockEmitAsync.mockResolvedValue({ commands: [], error: 'nope' });

      await useCustomCommandStore.getState().fetchForProject(PROJECT);

      expect(useCustomCommandStore.getState().error).toBe('nope');
      expect(useCustomCommandStore.getState().isLoading).toBe(false);
    });

    it('skips when projectPath is empty', async () => {
      await useCustomCommandStore.getState().fetchForProject('');
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });
  });

  describe('createCommand', () => {
    it('updates the cache from the response', async () => {
      const created = sample('new');
      mockEmitAsync.mockResolvedValue({
        success: true,
        command: created,
        commands: [created],
      });

      const result = await useCustomCommandStore
        .getState()
        .createCommand(PROJECT, { label: 'L', icon: 'Play', command: 'echo' });

      expect(result).toEqual(created);
      expect(useCustomCommandStore.getState().commandsByProject[PROJECT]).toEqual([created]);
    });

    it('records error from server response', async () => {
      mockEmitAsync.mockResolvedValue({ success: false, error: 'bad' });
      const result = await useCustomCommandStore
        .getState()
        .createCommand(PROJECT, { label: 'L', icon: 'Play', command: 'echo' });
      expect(result).toBeNull();
      expect(useCustomCommandStore.getState().error).toBe('bad');
    });
  });

  describe('updateCommand & deleteCommand', () => {
    it('applies update response to cache', async () => {
      const updated = sample('cmd-1', { label: 'New' });
      mockEmitAsync.mockResolvedValue({
        success: true,
        command: updated,
        commands: [updated],
      });
      const result = await useCustomCommandStore
        .getState()
        .updateCommand(PROJECT, 'cmd-1', { label: 'New' });
      expect(result).toEqual(updated);
      expect(useCustomCommandStore.getState().commandsByProject[PROJECT]).toEqual([updated]);
    });

    it('reflects delete response', async () => {
      mockEmitAsync.mockResolvedValue({ success: true, commands: [] });
      const ok = await useCustomCommandStore.getState().deleteCommand(PROJECT, 'cmd-1');
      expect(ok).toBe(true);
      expect(useCustomCommandStore.getState().commandsByProject[PROJECT]).toEqual([]);
    });
  });

  describe('executeCommand', () => {
    it('returns sessionId on success', async () => {
      mockEmitAsync.mockResolvedValue({ success: true, sessionId: 's-1' });
      const id = await useCustomCommandStore.getState().executeCommand(PROJECT, 'cmd-1');
      expect(id).toBe('s-1');
    });

    it('returns null and records error on failure', async () => {
      mockEmitAsync.mockResolvedValue({ success: false, error: 'denied' });
      const id = await useCustomCommandStore.getState().executeCommand(PROJECT, 'cmd-1');
      expect(id).toBeNull();
      expect(useCustomCommandStore.getState().error).toBe('denied');
    });
  });

  describe('listeners', () => {
    it('updates the cache when a CHANGED event arrives', () => {
      useCustomCommandStore.getState().initListeners();

      mockSocket.__simulateEvent(CustomCommandEvents.CHANGED, {
        projectPath: PROJECT,
        commands: [sample('x')],
      });

      const state = useCustomCommandStore.getState();
      expect(state.commandsByProject[PROJECT]).toHaveLength(1);
      expect(state.loadedProjects.has(PROJECT)).toBe(true);
    });
  });

  describe('selector', () => {
    it('returns the same empty array reference for unloaded projects', () => {
      const sel = selectCommandsForProject('/missing');
      const a = sel(useCustomCommandStore.getState());
      const b = sel(useCustomCommandStore.getState());
      expect(a).toEqual([]);
      expect(a).toBe(b);
    });

    it('returns the project list when loaded', () => {
      useCustomCommandStore.setState({
        commandsByProject: { [PROJECT]: [sample()] },
        loadedProjects: new Set([PROJECT]),
      });
      const sel = selectCommandsForProject(PROJECT);
      expect(sel(useCustomCommandStore.getState())).toHaveLength(1);
    });
  });
});
