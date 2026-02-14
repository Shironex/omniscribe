// ---- Mocks ----

const mockShowOpenDialog = jest.fn();
const mockShowMessageBox = jest.fn();

const handlers: Record<string, (...args: unknown[]) => unknown> = {};

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  ipcMain: {
    handle: jest.fn((channel: string, handler: (...a: unknown[]) => unknown) => {
      handlers[channel] = handler as (...args: unknown[]) => unknown;
    }),
    removeHandler: jest.fn(),
  },
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
    showMessageBox: (...args: unknown[]) => mockShowMessageBox(...args),
  },
}));

// ---- Tests ----

import { BrowserWindow, ipcMain } from 'electron';
import { registerDialogHandlers, cleanupDialogHandlers } from './dialog';

describe('IPC:Dialog', () => {
  const mockEvent = {} as Electron.IpcMainInvokeEvent;
  const mockMainWindow = new BrowserWindow() as unknown as BrowserWindow;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(handlers)) {
      delete handlers[key];
    }
    registerDialogHandlers(mockMainWindow);
  });

  // ================================================================
  // Handler registration
  // ================================================================
  describe('registerDialogHandlers', () => {
    it('should register all 3 dialog handlers', () => {
      expect(ipcMain.handle).toHaveBeenCalledWith('dialog:open-directory', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('dialog:open-file', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('dialog:message', expect.any(Function));
    });
  });

  // ================================================================
  // dialog:open-directory
  // ================================================================
  describe('dialog:open-directory', () => {
    it('should return selected directory path', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/home/user/project'],
      });

      const result = await handlers['dialog:open-directory'](mockEvent);

      expect(result).toBe('/home/user/project');
    });

    it('should return null when dialog is canceled', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const result = await handlers['dialog:open-directory'](mockEvent);

      expect(result).toBeNull();
    });

    it('should always set properties to openDirectory', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      // Even if options contain 'properties', it should be overridden
      await handlers['dialog:open-directory'](mockEvent, {
        properties: ['openFile', 'multiSelections'],
      });

      expect(mockShowOpenDialog).toHaveBeenCalledWith(
        mockMainWindow,
        expect.objectContaining({ properties: ['openDirectory'] })
      );
      // Verify that the user-supplied properties were NOT passed through
      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.properties).toEqual(['openDirectory']);
    });

    it('should truncate title to 200 characters', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const longTitle = 'A'.repeat(300);

      await handlers['dialog:open-directory'](mockEvent, { title: longTitle });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.title).toHaveLength(200);
    });

    it('should strip dangerous characters from defaultPath', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await handlers['dialog:open-directory'](mockEvent, {
        defaultPath: 'path<script>"test"|file?name*',
      });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.defaultPath).toBe('pathscripttestfilename');
    });

    it('should truncate buttonLabel to 50 characters', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const longLabel = 'B'.repeat(100);

      await handlers['dialog:open-directory'](mockEvent, { buttonLabel: longLabel });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.buttonLabel).toHaveLength(50);
    });

    it('should limit filters to 10 entries', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const filters = Array.from({ length: 15 }, (_, i) => ({
        name: `Filter ${i}`,
        extensions: ['txt'],
      }));

      await handlers['dialog:open-directory'](mockEvent, { filters });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.filters).toHaveLength(10);
    });

    it('should truncate filter names to 100 characters', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const longName = 'F'.repeat(200);

      await handlers['dialog:open-directory'](mockEvent, {
        filters: [{ name: longName, extensions: ['txt'] }],
      });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.filters[0].name).toHaveLength(100);
    });

    it('should limit filter extensions to 20 entries', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const extensions = Array.from({ length: 30 }, (_, i) => `ext${i}`);

      await handlers['dialog:open-directory'](mockEvent, {
        filters: [{ name: 'Test', extensions }],
      });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.filters[0].extensions).toHaveLength(20);
    });

    it('should handle undefined options', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await handlers['dialog:open-directory'](mockEvent);

      expect(mockShowOpenDialog).toHaveBeenCalledWith(
        mockMainWindow,
        expect.objectContaining({ properties: ['openDirectory'] })
      );
    });

    it('should filter out invalid filter entries', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await handlers['dialog:open-directory'](mockEvent, {
        filters: [
          { name: 'Valid', extensions: ['txt'] },
          { name: 123, extensions: ['txt'] } as unknown as Electron.FileFilter, // invalid name
          { name: 'Also valid', extensions: ['js'] },
        ],
      });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.filters).toHaveLength(2);
    });
  });

  // ================================================================
  // dialog:open-file
  // ================================================================
  describe('dialog:open-file', () => {
    it('should return selected file path', async () => {
      mockShowOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/home/user/file.txt'],
      });

      const result = await handlers['dialog:open-file'](mockEvent);

      expect(result).toBe('/home/user/file.txt');
    });

    it('should return null when dialog is canceled', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      const result = await handlers['dialog:open-file'](mockEvent);

      expect(result).toBeNull();
    });

    it('should always set properties to openFile', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

      await handlers['dialog:open-file'](mockEvent, {
        properties: ['openDirectory', 'multiSelections'],
      });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.properties).toEqual(['openFile']);
    });

    it('should sanitize options (title truncation, defaultPath filtering)', async () => {
      mockShowOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
      const longTitle = 'X'.repeat(300);

      await handlers['dialog:open-file'](mockEvent, {
        title: longTitle,
        defaultPath: 'path<script>"test"',
      });

      const passedOptions = mockShowOpenDialog.mock.calls[0][1];
      expect(passedOptions.title).toHaveLength(200);
      expect(passedOptions.defaultPath).toBe('pathscripttest');
    });
  });

  // ================================================================
  // dialog:message
  // ================================================================
  describe('dialog:message', () => {
    it('should return button index from message box', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });

      const result = await handlers['dialog:message'](mockEvent, {
        message: 'Are you sure?',
        buttons: ['Cancel', 'OK'],
      });

      expect(result).toBe(1);
    });

    it('should default type to info for invalid types', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });

      await handlers['dialog:message'](mockEvent, {
        type: 'invalid-type' as 'info',
        message: 'Test',
      });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.type).toBe('info');
    });

    it('should allow valid dialog types', async () => {
      const validTypes = ['none', 'info', 'error', 'question', 'warning'] as const;

      for (const type of validTypes) {
        mockShowMessageBox.mockResolvedValue({ response: 0 });
        await handlers['dialog:message'](mockEvent, { type, message: 'Test' });

        const passedOptions =
          mockShowMessageBox.mock.calls[mockShowMessageBox.mock.calls.length - 1][1];
        expect(passedOptions.type).toBe(type);
      }
    });

    it('should truncate title to 200 characters', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const longTitle = 'T'.repeat(300);

      await handlers['dialog:message'](mockEvent, { title: longTitle, message: 'Test' });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.title).toHaveLength(200);
    });

    it('should default title to Omniscribe', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });

      await handlers['dialog:message'](mockEvent, { message: 'Test' });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.title).toBe('Omniscribe');
    });

    it('should truncate message to 2000 characters', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const longMessage = 'M'.repeat(3000);

      await handlers['dialog:message'](mockEvent, { message: longMessage });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.message).toHaveLength(2000);
    });

    it('should truncate detail to 2000 characters', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const longDetail = 'D'.repeat(3000);

      await handlers['dialog:message'](mockEvent, { message: 'Test', detail: longDetail });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.detail).toHaveLength(2000);
    });

    it('should limit buttons to 5 entries', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const buttons = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

      await handlers['dialog:message'](mockEvent, { message: 'Test', buttons });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.buttons).toHaveLength(5);
    });

    it('should truncate button labels to 50 characters', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      const longButton = 'B'.repeat(100);

      await handlers['dialog:message'](mockEvent, {
        message: 'Test',
        buttons: [longButton],
      });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.buttons[0]).toHaveLength(50);
    });

    it('should default buttons to [OK]', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });

      await handlers['dialog:message'](mockEvent, { message: 'Test' });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.buttons).toEqual(['OK']);
    });

    it('should filter out non-string buttons', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });

      await handlers['dialog:message'](mockEvent, {
        message: 'Test',
        buttons: ['OK', 42 as unknown as string, 'Cancel'],
      });

      const passedOptions = mockShowMessageBox.mock.calls[0][1];
      expect(passedOptions.buttons).toEqual(['OK', 'Cancel']);
    });
  });

  // ================================================================
  // cleanupDialogHandlers
  // ================================================================
  describe('cleanupDialogHandlers', () => {
    it('should remove all 3 handlers', () => {
      cleanupDialogHandlers();

      expect(ipcMain.removeHandler).toHaveBeenCalledWith('dialog:open-directory');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('dialog:open-file');
      expect(ipcMain.removeHandler).toHaveBeenCalledWith('dialog:message');
    });
  });
});
