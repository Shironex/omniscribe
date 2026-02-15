import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilePathLinkProvider } from '../terminal-link-provider';
import type { ILink } from '@xterm/xterm';

function createMockTerminal(lineContent: string | null) {
  return {
    buffer: {
      active: {
        getLine: vi.fn(() =>
          lineContent !== null ? { translateToString: () => lineContent } : undefined
        ),
      },
    },
  } as unknown as import('@xterm/xterm').Terminal;
}

function getLinks(provider: FilePathLinkProvider, y: number): Promise<ILink[] | undefined> {
  return new Promise(resolve => {
    provider.provideLinks(y, resolve);
  });
}

describe('FilePathLinkProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('provideLinks', () => {
    it('returns undefined when line does not exist', async () => {
      const terminal = createMockTerminal(null);
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toBeUndefined();
    });

    it('returns undefined when line has no file paths', async () => {
      const terminal = createMockTerminal('hello world no paths here');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toBeUndefined();
    });

    it('detects Unix absolute paths', async () => {
      const terminal = createMockTerminal('Error in /home/user/file.ts');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe('/home/user/file.ts');
    });

    it('detects paths with line numbers', async () => {
      const terminal = createMockTerminal('Error at /home/user/file.ts:123');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe('/home/user/file.ts:123');
    });

    it('detects paths with line and column numbers', async () => {
      const terminal = createMockTerminal('Error at /home/user/file.ts:123:45');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe('/home/user/file.ts:123:45');
    });

    it('detects relative paths', async () => {
      const terminal = createMockTerminal('See ./src/foo.ts:10');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe('./src/foo.ts:10');
    });

    it('detects parent-relative paths', async () => {
      const terminal = createMockTerminal('See ../utils/helper.ts');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe('../utils/helper.ts');
    });

    it('detects Windows paths', async () => {
      const terminal = createMockTerminal('Error in C:\\Users\\file.ts:5');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(1);
      expect(links![0].text).toBe('C:\\Users\\file.ts:5');
    });

    it('skips http:// URLs', async () => {
      const terminal = createMockTerminal('Visit http://example.com/path/to/page');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toBeUndefined();
    });

    it('skips https:// URLs', async () => {
      const terminal = createMockTerminal('Visit https://example.com/path/to/page');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toBeUndefined();
    });

    it('skips ws:// URLs', async () => {
      const terminal = createMockTerminal('Connected to ws://localhost/path/ws');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toBeUndefined();
    });

    it('skips wss:// URLs', async () => {
      const terminal = createMockTerminal('Connected to wss://localhost/path/ws');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toBeUndefined();
    });

    it('returns correct range positions for links', async () => {
      const text = 'Error at /path/to/file.ts:10 done';
      const terminal = createMockTerminal(text);
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 3);
      expect(links).toHaveLength(1);

      const startCol = text.indexOf('/path/to/file.ts:10');
      expect(links![0].range.start.x).toBe(startCol + 1);
      expect(links![0].range.start.y).toBe(3);
      expect(links![0].range.end.x).toBe(startCol + '/path/to/file.ts:10'.length);
      expect(links![0].range.end.y).toBe(3);
    });

    it('handles multiple paths on same line', async () => {
      const terminal = createMockTerminal('/path/a.ts and /path/b.ts');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      expect(links).toHaveLength(2);
      expect(links![0].text).toBe('/path/a.ts');
      expect(links![1].text).toBe('/path/b.ts');
    });

    it('reads from correct buffer line (y-1)', async () => {
      const terminal = createMockTerminal('/some/file.ts');
      const provider = new FilePathLinkProvider(terminal);

      await getLinks(provider, 5);
      expect(terminal.buffer.active.getLine).toHaveBeenCalledWith(4);
    });
  });

  describe('activate handler', () => {
    it('opens vscode:// URI by default', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('/home/user/file.ts');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      links![0].activate({} as MouseEvent, '/home/user/file.ts');

      expect(openSpy).toHaveBeenCalledWith('vscode://file/home/user/file.ts', '_blank');
    });

    it('appends line number to URI', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('/home/user/file.ts:42');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      links![0].activate({} as MouseEvent, '/home/user/file.ts:42');

      expect(openSpy).toHaveBeenCalledWith('vscode://file/home/user/file.ts:42', '_blank');
    });

    it('appends line and column to URI', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('/home/user/file.ts:42:10');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      links![0].activate({} as MouseEvent, '/home/user/file.ts:42:10');

      expect(openSpy).toHaveBeenCalledWith('vscode://file/home/user/file.ts:42:10', '_blank');
    });

    it('normalizes Windows backslashes in URI', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('C:\\Users\\test\\file.ts');
      const provider = new FilePathLinkProvider(terminal);

      const links = await getLinks(provider, 1);
      links![0].activate({} as MouseEvent, 'C:\\Users\\test\\file.ts');

      expect(openSpy).toHaveBeenCalledWith('vscode://file/C:/Users/test/file.ts', '_blank');
    });

    it('uses cursor:// protocol when configured', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('/home/user/file.ts');
      const provider = new FilePathLinkProvider(terminal, () => 'cursor');

      const links = await getLinks(provider, 1);
      links![0].activate({} as MouseEvent, '/home/user/file.ts');

      expect(openSpy).toHaveBeenCalledWith('cursor://file/home/user/file.ts', '_blank');
    });

    it('uses vscode-insiders:// protocol when configured', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('/home/user/file.ts:10:5');
      const provider = new FilePathLinkProvider(terminal, () => 'vscode-insiders');

      const links = await getLinks(provider, 1);
      links![0].activate({} as MouseEvent, '/home/user/file.ts:10:5');

      expect(openSpy).toHaveBeenCalledWith(
        'vscode-insiders://file/home/user/file.ts:10:5',
        '_blank'
      );
    });

    it('reads protocol dynamically from getter on each activation', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const terminal = createMockTerminal('/home/user/file.ts');
      let currentProtocol = 'vscode';
      const provider = new FilePathLinkProvider(terminal, () => currentProtocol);

      const links = await getLinks(provider, 1);

      // First activation uses vscode
      links![0].activate({} as MouseEvent, '/home/user/file.ts');
      expect(openSpy).toHaveBeenCalledWith('vscode://file/home/user/file.ts', '_blank');

      // Change protocol
      currentProtocol = 'cursor';

      // Second activation uses cursor (same link instance, different protocol)
      links![0].activate({} as MouseEvent, '/home/user/file.ts');
      expect(openSpy).toHaveBeenCalledWith('cursor://file/home/user/file.ts', '_blank');
    });
  });
});
