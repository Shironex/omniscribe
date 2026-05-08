import { useTerminalStore } from '@/stores/useTerminalStore';
import { getTerminalTheme } from '@/lib/terminal-themes';

interface PreviewLine {
  segments: ReadonlyArray<{
    text: string;
    color?: 'fg' | 'green' | 'blue' | 'yellow' | 'red' | 'magenta' | 'cyan' | 'brightBlack';
  }>;
}

const PREVIEW_LINES: ReadonlyArray<PreviewLine> = [
  {
    segments: [
      { text: '➜  ', color: 'green' },
      { text: 'omniscribe ', color: 'cyan' },
      { text: 'git:(', color: 'brightBlack' },
      { text: 'master', color: 'red' },
      { text: ') ', color: 'brightBlack' },
      { text: 'pnpm dev', color: 'fg' },
    ],
  },
  {
    segments: [
      { text: '> ', color: 'brightBlack' },
      { text: '@omniscribe/desktop@1.7.0 ', color: 'magenta' },
      { text: 'dev', color: 'fg' },
    ],
  },
  {
    segments: [
      { text: '[main] ', color: 'blue' },
      { text: 'Loaded ', color: 'fg' },
      { text: '12 ', color: 'yellow' },
      { text: 'modules', color: 'fg' },
    ],
  },
  {
    segments: [
      { text: '[web]  ', color: 'cyan' },
      { text: 'VITE v5.4.0  ', color: 'green' },
      { text: 'ready in 412 ms', color: 'fg' },
    ],
  },
  {
    segments: [
      { text: 'warn', color: 'yellow' },
      { text: ': ', color: 'fg' },
      { text: 'experimental flag enabled', color: 'fg' },
    ],
  },
  {
    segments: [
      { text: 'error', color: 'red' },
      { text: ': ', color: 'fg' },
      { text: 'ENOENT: no such file ', color: 'fg' },
      { text: '~/.config', color: 'magenta' },
    ],
  },
];

/**
 * Live preview of the terminal styling. Mirrors shiroani's
 * `DiscordPreview` editorial pattern — shows real settings applied
 * to a fake xterm-style pane so users see consequence without
 * leaving Settings.
 */
export function TerminalPreview() {
  const fontSize = useTerminalStore(s => s.fontSize);
  const lineHeight = useTerminalStore(s => s.lineHeight);
  const themeName = useTerminalStore(s => s.terminalThemeName);
  const cursorBlink = useTerminalStore(s => s.cursorBlink);
  const cursorStyle = useTerminalStore(s => s.cursorStyle);

  const theme = getTerminalTheme(themeName);

  const colorFor = (color?: string): string => {
    if (!color || color === 'fg') return theme.foreground ?? '#fff';
    const value = (theme as unknown as Record<string, string | undefined>)[color];
    return value ?? theme.foreground ?? '#fff';
  };

  const cursorBlock = (
    <span
      className={cursorBlink ? 'animate-pulse' : undefined}
      style={{
        display: 'inline-block',
        backgroundColor:
          cursorStyle === 'block' ? (theme.cursor ?? theme.foreground) : 'transparent',
        color: cursorStyle === 'block' ? (theme.cursorAccent ?? theme.background) : theme.cursor,
        borderBottom:
          cursorStyle === 'underline' ? `2px solid ${theme.cursor ?? theme.foreground}` : undefined,
        borderLeft:
          cursorStyle === 'bar' ? `2px solid ${theme.cursor ?? theme.foreground}` : undefined,
        width: cursorStyle === 'block' ? `${fontSize * 0.55}px` : undefined,
        height: cursorStyle === 'block' ? `${fontSize}px` : `${fontSize}px`,
        verticalAlign: 'middle',
        marginLeft: '2px',
      }}
      aria-hidden="true"
    >
      {cursorStyle === 'block' ? ' ' : ''}
    </span>
  );

  return (
    <div
      className="rounded-lg border border-border-glass overflow-hidden font-mono select-none"
      style={{
        backgroundColor: theme.background,
        color: theme.foreground,
        fontSize: `${fontSize}px`,
        lineHeight,
        padding: '12px 14px',
        minHeight: 160,
      }}
      role="img"
      aria-label="Terminal preview"
    >
      {PREVIEW_LINES.map((line, idx) => (
        <div key={idx}>
          {line.segments.map((seg, segIdx) => (
            <span key={segIdx} style={{ color: colorFor(seg.color) }}>
              {seg.text}
            </span>
          ))}
        </div>
      ))}
      <div>
        <span style={{ color: colorFor('green') }}>➜</span>{' '}
        <span style={{ color: colorFor('cyan') }}>omniscribe</span>
        {cursorBlock}
      </div>
    </div>
  );
}
