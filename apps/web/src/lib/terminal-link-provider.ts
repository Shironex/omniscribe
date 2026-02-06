import type { ILinkProvider, ILink, Terminal, IBufferCellPosition } from '@xterm/xterm';

// Matches file paths with optional line:col
// Unix: /path/to/file.ts:123:45, ./relative.ts:10
// Windows: C:\path\to\file.ts:5
const FILE_PATH_REGEX =
  /(?:(?:[a-zA-Z]:)?(?:[\\/][\w.\-@]+)+|\.{1,2}(?:[\\/][\w.\-@]+)+)(?::(\d+)(?::(\d+))?)?/g;

// Skip URLs
const URL_PREFIXES = ['http://', 'https://', 'ws://', 'wss://'];

export class FilePathLinkProvider implements ILinkProvider {
  constructor(private readonly terminal: Terminal) {}

  provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
    const line = this.terminal.buffer.active.getLine(y - 1);
    if (!line) {
      callback(undefined);
      return;
    }

    const text = line.translateToString();
    const links: ILink[] = [];

    let match: RegExpExecArray | null;
    FILE_PATH_REGEX.lastIndex = 0;

    while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
      const fullMatch = match[0];
      const startCol = match.index;

      // Skip URLs
      const beforeMatch = text.slice(Math.max(0, startCol - 8), startCol);
      if (
        URL_PREFIXES.some(
          prefix =>
            beforeMatch.endsWith(prefix.slice(0, -1)) ||
            text
              .slice(Math.max(0, startCol - prefix.length), startCol + fullMatch.length)
              .includes(prefix)
        )
      ) {
        continue;
      }

      const range = {
        start: { x: startCol + 1, y } as IBufferCellPosition,
        end: { x: startCol + fullMatch.length + 1, y } as IBufferCellPosition,
      };

      links.push({
        range,
        text: fullMatch,
        activate: (_event: MouseEvent, linkText: string) => {
          // Extract path and optional line/col
          const parts = linkText.match(/^(.+?)(?::(\d+)(?::(\d+))?)?$/);
          if (!parts) return;

          const filePath = parts[1];
          const line = parts[2] ? parseInt(parts[2], 10) : undefined;
          const col = parts[3] ? parseInt(parts[3], 10) : undefined;

          // Build VS Code URI
          let uri = `vscode://file/${filePath.replace(/\\/g, '/')}`;
          if (line !== undefined) {
            uri += `:${line}`;
            if (col !== undefined) {
              uri += `:${col}`;
            }
          }

          window.open(uri);
        },
      });
    }

    callback(links.length > 0 ? links : undefined);
  }
}
