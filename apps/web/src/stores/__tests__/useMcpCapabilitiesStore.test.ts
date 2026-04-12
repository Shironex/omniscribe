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

import { useMcpCapabilitiesStore } from '../useMcpCapabilitiesStore';
import type { McpCapabilityDescriptor } from '@omniscribe/shared';

const initialState = {
  capabilities: [] as McpCapabilityDescriptor[],
  projectPath: null,
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

function caps(): McpCapabilityDescriptor[] {
  return [
    { id: 'omniscribe', label: 'Omniscribe', description: 'd1', enabled: true },
    { id: 'playwright-web', label: 'PW', description: 'd2', enabled: false },
  ];
}

describe('useMcpCapabilitiesStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useMcpCapabilitiesStore.setState(initialState);
  });

  afterEach(() => {
    const state = useMcpCapabilitiesStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  describe('initial state', () => {
    it('starts with empty capabilities and no project', () => {
      const s = useMcpCapabilitiesStore.getState();
      expect(s.capabilities).toEqual([]);
      expect(s.projectPath).toBeNull();
      expect(s.isLoading).toBe(false);
      expect(s.error).toBeNull();
    });
  });

  describe('fetchCapabilities', () => {
    it('emits CAPABILITY_LIST and stores the response', async () => {
      mockEmitAsync.mockResolvedValue({ capabilities: caps() });

      await useMcpCapabilitiesStore.getState().fetchCapabilities('/p');

      expect(mockEmitAsync).toHaveBeenCalledWith('mcp:capability-list', { projectPath: '/p' });
      const s = useMcpCapabilitiesStore.getState();
      expect(s.capabilities).toEqual(caps());
      expect(s.projectPath).toBe('/p');
      expect(s.isLoading).toBe(false);
      expect(s.error).toBeNull();
    });

    it('skips when projectPath is empty', async () => {
      await useMcpCapabilitiesStore.getState().fetchCapabilities('');
      expect(mockEmitAsync).not.toHaveBeenCalled();
    });

    it('records error from response', async () => {
      mockEmitAsync.mockResolvedValue({ capabilities: [], error: 'nope' });

      await useMcpCapabilitiesStore.getState().fetchCapabilities('/p');

      expect(useMcpCapabilitiesStore.getState().error).toBe('nope');
      expect(useMcpCapabilitiesStore.getState().isLoading).toBe(false);
    });

    it('records error on exception', async () => {
      mockEmitAsync.mockRejectedValue(new Error('boom'));

      await useMcpCapabilitiesStore.getState().fetchCapabilities('/p');

      expect(useMcpCapabilitiesStore.getState().error).toBe('boom');
    });
  });

  describe('toggleCapability', () => {
    it('applies optimistic update and reconciles to enabledIds', async () => {
      useMcpCapabilitiesStore.setState({ capabilities: caps(), projectPath: '/p' });
      mockEmitAsync.mockResolvedValue({
        success: true,
        enabledIds: ['omniscribe', 'playwright-web'],
      });

      await useMcpCapabilitiesStore.getState().toggleCapability('/p', 'playwright-web', true);

      expect(mockEmitAsync).toHaveBeenCalledWith('mcp:capability-toggle', {
        projectPath: '/p',
        capabilityId: 'playwright-web',
        enabled: true,
      });
      const updated = useMcpCapabilitiesStore.getState().capabilities;
      expect(updated.find(c => c.id === 'playwright-web')?.enabled).toBe(true);
      expect(updated.find(c => c.id === 'omniscribe')?.enabled).toBe(true);
    });

    it('rolls back on failure response', async () => {
      const before = caps();
      useMcpCapabilitiesStore.setState({ capabilities: before, projectPath: '/p' });
      mockEmitAsync.mockResolvedValue({ success: false, error: 'nope' });

      await useMcpCapabilitiesStore.getState().toggleCapability('/p', 'playwright-web', true);

      expect(useMcpCapabilitiesStore.getState().capabilities).toEqual(before);
      expect(useMcpCapabilitiesStore.getState().error).toBe('nope');
    });

    it('rolls back on thrown exception', async () => {
      const before = caps();
      useMcpCapabilitiesStore.setState({ capabilities: before, projectPath: '/p' });
      mockEmitAsync.mockRejectedValue(new Error('boom'));

      await useMcpCapabilitiesStore.getState().toggleCapability('/p', 'playwright-web', true);

      expect(useMcpCapabilitiesStore.getState().capabilities).toEqual(before);
      expect(useMcpCapabilitiesStore.getState().error).toBe('boom');
    });
  });

  describe('socket listeners', () => {
    it('registers and unregisters CAPABILITY_CHANGED listener', () => {
      useMcpCapabilitiesStore.getState().initListeners();
      expect(mockSocket.on).toHaveBeenCalledWith('mcp:capability-changed', expect.any(Function));

      useMcpCapabilitiesStore.getState().cleanupListeners();
      expect(mockSocket.off).toHaveBeenCalledWith('mcp:capability-changed', expect.any(Function));
    });

    it('reconciles capabilities on CAPABILITY_CHANGED for the active project', () => {
      useMcpCapabilitiesStore.setState({ capabilities: caps(), projectPath: '/p' });
      useMcpCapabilitiesStore.getState().initListeners();

      mockSocket.__simulateEvent('mcp:capability-changed', {
        projectPath: '/p',
        enabledIds: ['playwright-web'],
      });

      const updated = useMcpCapabilitiesStore.getState().capabilities;
      expect(updated.find(c => c.id === 'omniscribe')?.enabled).toBe(false);
      expect(updated.find(c => c.id === 'playwright-web')?.enabled).toBe(true);
    });

    it('ignores CAPABILITY_CHANGED for a different project', () => {
      const before = caps();
      useMcpCapabilitiesStore.setState({ capabilities: before, projectPath: '/p' });
      useMcpCapabilitiesStore.getState().initListeners();

      mockSocket.__simulateEvent('mcp:capability-changed', {
        projectPath: '/other',
        enabledIds: ['playwright-web'],
      });

      expect(useMcpCapabilitiesStore.getState().capabilities).toEqual(before);
    });
  });

  describe('clear', () => {
    it('resets capabilities and project state', () => {
      useMcpCapabilitiesStore.setState({
        capabilities: caps(),
        projectPath: '/p',
        error: 'x',
        isLoading: true,
      });

      useMcpCapabilitiesStore.getState().clear();

      const s = useMcpCapabilitiesStore.getState();
      expect(s.capabilities).toEqual([]);
      expect(s.projectPath).toBeNull();
      expect(s.error).toBeNull();
      expect(s.isLoading).toBe(false);
    });
  });
});
