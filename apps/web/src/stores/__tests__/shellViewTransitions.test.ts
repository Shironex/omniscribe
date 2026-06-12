import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';

// The editor store reads/writes files over the socket helpers; stub them so the
// module-scope subscriptions (which drive shellView) run without a backend.
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

// Importing useEditorStore wires the module-scope subscriptions that keep
// shellView in lockstep with the editor stack + settings modal.
import { useEditorStore } from '../useEditorStore';
import { useFsStore } from '../useFsStore';
import { useAppUIStore } from '../useAppUIStore';
import { useSettingsStore } from '../useSettingsStore';

const PROJECT = '/project';
const FILE_A = '/project/a.ts';
const FILE_B = '/project/b.ts';

function resetStores() {
  mockEmitAsync.mockReset();
  mockEmitAsync.mockResolvedValue({ content: '', size: 0 });
  useFsStore.setState({ projectPath: null, requestedOpenFile: null });
  useEditorStore.setState({ projectPath: null, files: [], activePath: null });
  useAppUIStore.setState({ shellView: 'terminal' });
  // Ensure settings starts closed without triggering the subscription mid-test.
  if (useSettingsStore.getState().isOpen) {
    useSettingsStore.setState({ isOpen: false });
  }
}

describe('shellView transitions', () => {
  beforeEach(() => {
    resetStores();
  });

  describe('opening a file', () => {
    it('switches shellView to editor when the explorer requests an open', async () => {
      // Simulate the explorer recording an open-file request.
      useFsStore.setState({ projectPath: PROJECT });
      useFsStore.getState().openFile(FILE_A);

      // The subscription opens the file asynchronously; let microtasks settle.
      await Promise.resolve();

      expect(useAppUIStore.getState().shellView).toBe('editor');
    });

    it('closes settings when a file is opened from the explorer', async () => {
      useSettingsStore.setState({ isOpen: true });
      useAppUIStore.setState({ shellView: 'settings' });

      useFsStore.setState({ projectPath: PROJECT });
      useFsStore.getState().openFile(FILE_A);
      await Promise.resolve();

      expect(useSettingsStore.getState().isOpen).toBe(false);
      expect(useAppUIStore.getState().shellView).toBe('editor');
    });
  });

  describe('closing the last file', () => {
    it('falls back to terminal when the last open file is closed while in editor', () => {
      useEditorStore.setState({
        projectPath: PROJECT,
        files: [{ path: FILE_A, content: '', savedContent: '', dirty: false, loading: false }],
        activePath: FILE_A,
      });
      useAppUIStore.setState({ shellView: 'editor' });

      useEditorStore.getState().closeFile(FILE_A);

      expect(useEditorStore.getState().files).toHaveLength(0);
      expect(useAppUIStore.getState().shellView).toBe('terminal');
    });

    it('stays in editor when a non-last file is closed', () => {
      useEditorStore.setState({
        projectPath: PROJECT,
        files: [
          { path: FILE_A, content: '', savedContent: '', dirty: false, loading: false },
          { path: FILE_B, content: '', savedContent: '', dirty: false, loading: false },
        ],
        activePath: FILE_A,
      });
      useAppUIStore.setState({ shellView: 'editor' });

      useEditorStore.getState().closeFile(FILE_A);

      expect(useEditorStore.getState().files).toHaveLength(1);
      expect(useAppUIStore.getState().shellView).toBe('editor');
    });

    it('does not force terminal when closing the last file from the terminal view', () => {
      useEditorStore.setState({
        projectPath: PROJECT,
        files: [{ path: FILE_A, content: '', savedContent: '', dirty: false, loading: false }],
        activePath: FILE_A,
      });
      useAppUIStore.setState({ shellView: 'terminal' });

      useEditorStore.getState().closeFile(FILE_A);

      // Already terminal — no-op, but importantly no error / no flip to editor.
      expect(useAppUIStore.getState().shellView).toBe('terminal');
    });
  });

  describe('settings open / close', () => {
    it('switches to settings when opened', () => {
      useSettingsStore.getState().openSettings();
      expect(useAppUIStore.getState().shellView).toBe('settings');
    });

    it('returns to editor on close when a file is still focused', () => {
      useEditorStore.setState({
        projectPath: PROJECT,
        files: [{ path: FILE_A, content: '', savedContent: '', dirty: false, loading: false }],
        activePath: FILE_A,
      });
      useSettingsStore.getState().openSettings();
      expect(useAppUIStore.getState().shellView).toBe('settings');

      useSettingsStore.getState().closeSettings();
      expect(useAppUIStore.getState().shellView).toBe('editor');
    });

    it('returns to terminal on close when no file is focused', () => {
      useSettingsStore.getState().openSettings();
      expect(useAppUIStore.getState().shellView).toBe('settings');

      useSettingsStore.getState().closeSettings();
      expect(useAppUIStore.getState().shellView).toBe('terminal');
    });
  });
});
