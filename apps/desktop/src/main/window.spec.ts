// Mock Electron APIs
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  shell: { openExternal: jest.fn() },
  session: {
    defaultSession: {
      webRequest: { onHeadersReceived: jest.fn() },
      setPermissionRequestHandler: jest.fn(),
      setPermissionCheckHandler: jest.fn(),
    },
  },
}));

jest.mock('./ipc-handlers', () => ({
  registerIpcHandlers: jest.fn(),
}));

jest.mock('./logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  },
}));

jest.mock('./backend-port', () => ({
  getBackendPort: jest.fn(() => 3000),
}));

import { isExternalUrlAllowed } from './window';

describe('isExternalUrlAllowed', () => {
  // --- Allowed protocols ---

  it('should allow http URLs', () => {
    expect(isExternalUrlAllowed('http://example.com')).toBe(true);
  });

  it('should allow https URLs', () => {
    expect(isExternalUrlAllowed('https://github.com/owner/repo/issues/1')).toBe(true);
  });

  it('should allow vscode protocol', () => {
    expect(isExternalUrlAllowed('vscode://file/path/to/file.ts:10:5')).toBe(true);
  });

  it('should allow vscode-insiders protocol', () => {
    expect(isExternalUrlAllowed('vscode-insiders://file/path/to/file.ts')).toBe(true);
  });

  it('should allow cursor protocol', () => {
    expect(isExternalUrlAllowed('cursor://file/path/to/file.ts')).toBe(true);
  });

  // --- Blocked protocols ---

  it('should block file protocol', () => {
    expect(isExternalUrlAllowed('file:///etc/passwd')).toBe(false);
  });

  it('should block javascript protocol', () => {
    expect(isExternalUrlAllowed('javascript:alert(1)')).toBe(false);
  });

  it('should block data protocol', () => {
    expect(isExternalUrlAllowed('data:text/html,<h1>test</h1>')).toBe(false);
  });

  it('should block about:blank', () => {
    expect(isExternalUrlAllowed('about:blank')).toBe(false);
  });

  // --- Edge cases ---

  it('should reject empty string', () => {
    expect(isExternalUrlAllowed('')).toBe(false);
  });

  it('should reject invalid URL', () => {
    expect(isExternalUrlAllowed('not-a-url')).toBe(false);
  });
});
