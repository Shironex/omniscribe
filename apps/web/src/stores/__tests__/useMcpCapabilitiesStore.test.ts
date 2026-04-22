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

    it('re-fetches full descriptors on CAPABILITY_CHANGED for the active project', async () => {
      useMcpCapabilitiesStore.setState({ capabilities: caps(), projectPath: '/p' });
      useMcpCapabilitiesStore.getState().initListeners();

      // CAPABILITY_CHANGED triggers a full re-fetch (not just an enabled-flag
      // flip) so descriptor fields like electronCdpPort/disabledReason stay
      // fresh for other windows after CAPABILITY_SET_PORT.
      const refreshed: McpCapabilityDescriptor[] = [
        { id: 'omniscribe', label: 'Omniscribe', description: 'd1', enabled: false },
        { id: 'playwright-web', label: 'PW', description: 'd2', enabled: true },
      ];
      mockEmitAsync.mockResolvedValue({ capabilities: refreshed });

      mockSocket.__simulateEvent('mcp:capability-changed', {
        projectPath: '/p',
        enabledIds: ['playwright-web'],
      });

      await vi.waitFor(() => {
        expect(mockEmitAsync).toHaveBeenCalledWith('mcp:capability-list', { projectPath: '/p' });
      });

      const updated = useMcpCapabilitiesStore.getState().capabilities;
      expect(updated).toEqual(refreshed);
    });

    it('ignores CAPABILITY_CHANGED for a different project', () => {
      const before = caps();
      useMcpCapabilitiesStore.setState({ capabilities: before, projectPath: '/p' });
      useMcpCapabilitiesStore.getState().initListeners();

      mockSocket.__simulateEvent('mcp:capability-changed', {
        projectPath: '/other',
        enabledIds: ['playwright-web'],
      });

      expect(mockEmitAsync).not.toHaveBeenCalled();
      expect(useMcpCapabilitiesStore.getState().capabilities).toEqual(before);
    });
  });

  describe('setElectronCdpPort', () => {
    it('emits CAPABILITY_SET_PORT and applies optimistic update', async () => {
      useMcpCapabilitiesStore.setState({
        capabilities: [
          {
            id: 'playwright-electron',
            label: 'PE',
            description: 'd',
            enabled: true,
            electronCdpPort: 9222,
          },
        ],
        projectPath: '/p',
      });
      mockEmitAsync.mockResolvedValue({ success: true, port: 9555 });

      await useMcpCapabilitiesStore
        .getState()
        .setElectronCdpPort('/p', 'playwright-electron', 9555);

      expect(mockEmitAsync).toHaveBeenCalledWith('mcp:capability-set-port', {
        projectPath: '/p',
        capabilityId: 'playwright-electron',
        port: 9555,
      });
      const updated = useMcpCapabilitiesStore.getState().capabilities;
      expect(updated.find(c => c.id === 'playwright-electron')?.electronCdpPort).toBe(9555);
    });

    it('rolls back on failure response', async () => {
      const before = [
        {
          id: 'playwright-electron',
          label: 'PE',
          description: 'd',
          enabled: true,
          electronCdpPort: 9222,
        },
      ];
      useMcpCapabilitiesStore.setState({ capabilities: before, projectPath: '/p' });
      mockEmitAsync.mockResolvedValue({ success: false, error: 'nope' });

      await useMcpCapabilitiesStore.getState().setElectronCdpPort('/p', 'playwright-electron', 80);

      expect(useMcpCapabilitiesStore.getState().capabilities).toEqual(before);
      expect(useMcpCapabilitiesStore.getState().error).toBe('nope');
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
