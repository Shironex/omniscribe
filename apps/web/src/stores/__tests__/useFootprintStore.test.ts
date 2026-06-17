import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';

// Mock the socket module
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

import {
  useFootprintStore,
  selectFootprintEntries,
  selectFootprintPassiveMode,
  selectFootprintRemoving,
  selectFootprintError,
} from '../useFootprintStore';
import {
  FootprintEvents,
  type FootprintEntry,
  type FootprintGetResponse,
  type FootprintRemoveResponse,
  type FootprintSetPassiveModeResponse,
  type FootprintGetPassiveModeResponse,
} from '@omniscribe/shared';

const PROJECT = '/home/me/proj';

const sampleEntries: FootprintEntry[] = [
  {
    kind: 'mcp-config',
    path: `${PROJECT}/.mcp.json`,
    description: '2 managed MCP entries',
    count: 2,
  },
  {
    kind: 'claude-hooks',
    path: `${PROJECT}/.claude/settings.local.json`,
    description: '4 Omniscribe hooks',
    count: 4,
  },
];

const initialState = {
  entries: [],
  passiveMode: false,
  projectPath: null,
  isRemoving: false,
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

/**
 * fetchFootprint emits GET then GET_PASSIVE_MODE via Promise.all — queue both
 * responses in call order on mockEmitAsync.
 */
function queueFetch(
  footprint: FootprintGetResponse,
  passive: FootprintGetPassiveModeResponse
): void {
  mockEmitAsync.mockImplementation((event: string) => {
    if (event === FootprintEvents.GET) return Promise.resolve(footprint);
    if (event === FootprintEvents.GET_PASSIVE_MODE) return Promise.resolve(passive);
    return Promise.reject(new Error(`unexpected event ${event}`));
  });
}

describe('useFootprintStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useFootprintStore.setState(initialState);
  });

  afterEach(() => {
    const state = useFootprintStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  describe('initial state', () => {
    it('starts empty with passive mode off', () => {
      const s = useFootprintStore.getState();
      expect(selectFootprintEntries(s)).toEqual([]);
      expect(selectFootprintPassiveMode(s)).toBe(false);
      expect(selectFootprintRemoving(s)).toBe(false);
      expect(selectFootprintError(s)).toBeNull();
    });
  });

  describe('fetchFootprint', () => {
    it('populates entries and passive mode from the responses', async () => {
      queueFetch({ entries: sampleEntries }, { enabled: true });

      await useFootprintStore.getState().fetchFootprint(PROJECT);

      const s = useFootprintStore.getState();
      expect(s.entries).toEqual(sampleEntries);
      expect(s.passiveMode).toBe(true);
      expect(s.projectPath).toBe(PROJECT);
      expect(s.isLoading).toBe(false);
      expect(s.error).toBeNull();
    });

    it('surfaces a footprint error and does not overwrite entries', async () => {
      queueFetch({ entries: [], error: 'boom' }, { enabled: false });

      await useFootprintStore.getState().fetchFootprint(PROJECT);

      const s = useFootprintStore.getState();
      expect(s.error).toBe('boom');
      expect(s.isLoading).toBe(false);
    });

    it('ignores an empty projectPath', async () => {
      await useFootprintStore.getState().fetchFootprint('');
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });
  });

  describe('setPassiveMode', () => {
    it('optimistically flips then reconciles to the server value', async () => {
      useFootprintStore.setState({ projectPath: PROJECT });
      mockEmitAsync.mockResolvedValueOnce({
        success: true,
        enabled: true,
      } satisfies FootprintSetPassiveModeResponse);

      const ok = await useFootprintStore.getState().setPassiveMode(PROJECT, true);

      expect(ok).toBe(true);
      expect(useFootprintStore.getState().passiveMode).toBe(true);
      expect(mockEmitAsync).toHaveBeenCalledWith(FootprintEvents.SET_PASSIVE_MODE, {
        projectPath: PROJECT,
        enabled: true,
      });
    });

    it('rolls back the optimistic update when the server rejects', async () => {
      useFootprintStore.setState({ projectPath: PROJECT, passiveMode: false });
      mockEmitAsync.mockResolvedValueOnce({
        success: false,
        enabled: false,
        error: 'nope',
      } satisfies FootprintSetPassiveModeResponse);

      const ok = await useFootprintStore.getState().setPassiveMode(PROJECT, true);

      expect(ok).toBe(false);
      const s = useFootprintStore.getState();
      expect(s.passiveMode).toBe(false);
      expect(s.error).toBe('nope');
    });
  });

  describe('removeFootprint', () => {
    it('emits the requested kinds and returns per-kind results', async () => {
      useFootprintStore.setState({ projectPath: PROJECT });
      const results: FootprintRemoveResponse = {
        success: true,
        results: [
          { kind: 'mcp-config', ok: true },
          { kind: 'claude-hooks', ok: true },
        ],
      };
      // First call: REMOVE. Subsequent calls: the re-fetch (GET + GET_PASSIVE_MODE).
      mockEmitAsync.mockImplementation((event: string) => {
        if (event === FootprintEvents.REMOVE) return Promise.resolve(results);
        if (event === FootprintEvents.GET) return Promise.resolve({ entries: [] });
        if (event === FootprintEvents.GET_PASSIVE_MODE) return Promise.resolve({ enabled: false });
        return Promise.reject(new Error(`unexpected ${event}`));
      });

      const returned = await useFootprintStore
        .getState()
        .removeFootprint(PROJECT, ['mcp-config', 'claude-hooks']);

      expect(returned).toEqual(results.results);
      expect(mockEmitAsync).toHaveBeenCalledWith(FootprintEvents.REMOVE, {
        projectPath: PROJECT,
        kinds: ['mcp-config', 'claude-hooks'],
      });
      expect(useFootprintStore.getState().isRemoving).toBe(false);
    });

    it('no-ops for an empty kinds array', async () => {
      const returned = await useFootprintStore.getState().removeFootprint(PROJECT, []);
      expect(returned).toEqual([]);
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('surfaces a removal error', async () => {
      useFootprintStore.setState({ projectPath: PROJECT });
      mockEmitAsync.mockResolvedValueOnce({
        success: false,
        results: [],
        error: 'disk full',
      } satisfies FootprintRemoveResponse);

      await useFootprintStore.getState().removeFootprint(PROJECT, ['mcp-config']);

      const s = useFootprintStore.getState();
      expect(s.error).toBe('disk full');
      expect(s.isRemoving).toBe(false);
    });
  });

  describe('footprint:changed listener', () => {
    it('re-fetches when the changed project matches the active project', async () => {
      useFootprintStore.getState().initListeners();
      useFootprintStore.setState({ projectPath: PROJECT });
      queueFetch({ entries: sampleEntries }, { enabled: false });

      mockSocket.__simulateEvent(FootprintEvents.CHANGED, { projectPath: PROJECT });
      // Allow the async fetch kicked off by the listener to settle.
      await Promise.resolve();
      await Promise.resolve();

      expect(mockEmitAsync).toHaveBeenCalledWith(FootprintEvents.GET, { projectPath: PROJECT });
    });

    it('ignores changes for a different project', () => {
      useFootprintStore.getState().initListeners();
      useFootprintStore.setState({ projectPath: PROJECT });

      mockSocket.__simulateEvent(FootprintEvents.CHANGED, { projectPath: '/other/proj' });

      expect(mockEmitAsync).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('resets to the empty state', () => {
      useFootprintStore.setState({
        projectPath: PROJECT,
        entries: sampleEntries,
        passiveMode: true,
        error: 'x',
      });

      useFootprintStore.getState().clear();

      const s = useFootprintStore.getState();
      expect(s.entries).toEqual([]);
      expect(s.passiveMode).toBe(false);
      expect(s.projectPath).toBeNull();
      expect(s.error).toBeNull();
    });
  });
});
