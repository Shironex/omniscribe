import { useMemo } from 'react';

/** A styled text segment produced by parsing ANSI escape codes */
interface AnsiSegment {
  text: string;
  style: React.CSSProperties;
}

// Standard ANSI colors (0-7)
const STANDARD_COLORS = [
  '#000000', // black
  '#cc0000', // red
  '#4e9a06', // green
  '#c4a000', // yellow
  '#3465a4', // blue
  '#75507b', // magenta
  '#06989a', // cyan
  '#d3d7cf', // white
];

// Bright ANSI colors (8-15)
const BRIGHT_COLORS = [
  '#555753', // bright black
  '#ef2929', // bright red
  '#8ae234', // bright green
  '#fce94f', // bright yellow
  '#729fcf', // bright blue
  '#ad7fa8', // bright magenta
  '#34e2e2', // bright cyan
  '#eeeeec', // bright white
];

/** Convert a 256-color index to a CSS hex color */
function color256ToHex(index: number): string | undefined {
  if (index < 8) return STANDARD_COLORS[index];
  if (index < 16) return BRIGHT_COLORS[index - 8];

  // 216-color cube (indices 16-231)
  if (index < 232) {
    const i = index - 16;
    const r = Math.floor(i / 36);
    const g = Math.floor((i % 36) / 6);
    const b = i % 6;
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  // Grayscale (indices 232-255)
  if (index < 256) {
    const level = 8 + (index - 232) * 10;
    const hex = level.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  return undefined;
}

interface StyleState {
  color?: string;
  backgroundColor?: string;
  fontWeight?: 'bold';
  fontStyle?: 'italic';
  textDecoration?: string;
  opacity?: number;
}

/** Parse SGR parameters and return updated style state */
function applySgr(params: number[], state: StyleState): StyleState {
  const next = { ...state };
  let i = 0;

  while (i < params.length) {
    const code = params[i];

    if (code === 0) {
      // Reset
      return {};
    } else if (code === 1) {
      next.fontWeight = 'bold';
    } else if (code === 2) {
      next.opacity = 0.6;
    } else if (code === 3) {
      next.fontStyle = 'italic';
    } else if (code === 4) {
      next.textDecoration = 'underline';
    } else if (code === 22) {
      delete next.fontWeight;
      delete next.opacity;
    } else if (code === 23) {
      delete next.fontStyle;
    } else if (code === 24) {
      delete next.textDecoration;
    } else if (code === 39) {
      delete next.color;
    } else if (code === 49) {
      delete next.backgroundColor;
    } else if (code >= 30 && code <= 37) {
      next.color = STANDARD_COLORS[code - 30];
    } else if (code >= 40 && code <= 47) {
      next.backgroundColor = STANDARD_COLORS[code - 40];
    } else if (code >= 90 && code <= 97) {
      next.color = BRIGHT_COLORS[code - 90];
    } else if (code >= 100 && code <= 107) {
      next.backgroundColor = BRIGHT_COLORS[code - 100];
    } else if (code === 38 || code === 48) {
      // Extended color: 38;5;N (256-color) or 38;2;R;G;B (RGB)
      const prop = code === 38 ? 'color' : 'backgroundColor';
      if (params[i + 1] === 5 && i + 2 < params.length) {
        const c = color256ToHex(params[i + 2]);
        if (c) next[prop] = c;
        i += 2;
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        const r = params[i + 2];
        const g = params[i + 3];
        const b = params[i + 4];
        next[prop] = `rgb(${r},${g},${b})`;
        i += 4;
      }
    }

    i++;
  }

  return next;
}

/** Parse ANSI-encoded text into styled segments */
function parseAnsi(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  let state: StyleState = {};
  let lastIndex = 0;

  // Match CSI SGR sequences: ESC [ <params> m
  // eslint-disable-next-line no-control-regex
  const regex = /\x1B\[([0-9;]*)m/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Collect text before this escape sequence
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk) {
        segments.push({ text: chunk, style: { ...state } });
      }
    }

    // Parse SGR params
    const paramStr = match[1];
    const params = paramStr === '' ? [0] : paramStr.split(';').map(Number);
    state = applySgr(params, state);

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last escape
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    // Strip any non-SGR escape sequences that slipped through
    // eslint-disable-next-line no-control-regex
    const cleaned = remaining.replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '');
    if (cleaned) {
      segments.push({ text: cleaned, style: { ...state } });
    }
  }

  return segments;
}

interface AnsiOutputProps {
  text: string;
  className?: string;
}

/**
 * Renders ANSI-encoded text as styled `<span>` elements.
 *
 * Supports: standard/bright/256/RGB foreground and background colors,
 * bold, italic, underline, dim, and reset codes.
 */
export function AnsiOutput({ text, className }: AnsiOutputProps) {
  const segments = useMemo(() => parseAnsi(text), [text]);

  return (
    <span className={className}>
      {segments.map((seg, i) => (
        <span key={i} style={seg.style}>
          {seg.text}
        </span>
      ))}
    </span>
  );
}
