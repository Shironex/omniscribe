/**
 * Builds a CodeMirror theme {@link Extension} from Omniscribe's live CSS theme
 * tokens. The editor must visually match whichever of the 8 curated themes is
 * active, and re-skin instantly on theme switch.
 *
 * Strategy mirrors the terminal: rather than maintaining a hand-written palette
 * per theme, we *probe* the CSS custom properties on `document.documentElement`
 * (where `applyThemeToDOM` stamps the active theme class) via `getComputedStyle`
 * and feed the resolved color strings straight into `EditorView.theme` +
 * a `HighlightStyle`. The browser already resolves `oklch(...)` so the strings
 * are valid CSS colors that CodeMirror passes through to the DOM.
 *
 * Re-building is driven by a `MutationObserver` on the documentElement `class`
 * attribute — exactly the surface `applyThemeToDOM` mutates — see
 * {@link observeEditorTheme}.
 *
 * Token reuse note: CodeMirror's `tags` object lives in `@lezer/highlight`,
 * which is *not* a declared dependency of this app (strict pnpm). Rather than
 * add a dependency, we re-color `defaultHighlightStyle.specs` (which carries the
 * tag references plus CodeMirror's default light palette) onto our theme tokens
 * by bucketing each spec's default color — keeping us inside the already-
 * installed `@codemirror/language`.
 */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/** The CSS custom properties the editor consumes, with sensible fallbacks. */
interface EditorTokens {
  background: string;
  foreground: string;
  foregroundMuted: string;
  foregroundSecondary: string;
  primary: string;
  accent: string;
  muted: string;
  border: string;
  card: string;
  statusError: string;
  statusSuccess: string;
  statusWarning: string;
  statusInfo: string;
}

const FALLBACK_TOKENS: EditorTokens = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  foregroundMuted: '#8a8a8a',
  foregroundSecondary: '#a8a8a8',
  primary: '#ff8c42',
  accent: '#5b8def',
  muted: '#2a2a2a',
  border: '#333333',
  card: '#252525',
  statusError: '#e05252',
  statusSuccess: '#3fb950',
  statusWarning: '#d6a23a',
  statusInfo: '#5b8def',
};

/**
 * Read a single CSS custom property off the document root, trimming whitespace.
 * Returns the fallback when the property is empty/undefined (e.g. SSR/jsdom
 * without the theme stylesheet loaded).
 */
function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name);
  const trimmed = value ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : fallback;
}

/**
 * Probe the active theme's tokens off `document.documentElement`.
 * Exported for testing the probe in isolation.
 */
export function probeEditorTokens(): EditorTokens {
  // jsdom and SSR guard — return a neutral dark palette so callers never crash.
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return { ...FALLBACK_TOKENS };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    background: readToken(styles, '--background', FALLBACK_TOKENS.background),
    foreground: readToken(styles, '--foreground', FALLBACK_TOKENS.foreground),
    foregroundMuted: readToken(styles, '--foreground-muted', FALLBACK_TOKENS.foregroundMuted),
    foregroundSecondary: readToken(
      styles,
      '--foreground-secondary',
      FALLBACK_TOKENS.foregroundSecondary
    ),
    primary: readToken(styles, '--primary', FALLBACK_TOKENS.primary),
    accent: readToken(styles, '--accent', FALLBACK_TOKENS.accent),
    muted: readToken(styles, '--muted', FALLBACK_TOKENS.muted),
    border: readToken(styles, '--border', FALLBACK_TOKENS.border),
    card: readToken(styles, '--card', FALLBACK_TOKENS.card),
    statusError: readToken(styles, '--status-error', FALLBACK_TOKENS.statusError),
    statusSuccess: readToken(styles, '--status-success', FALLBACK_TOKENS.statusSuccess),
    statusWarning: readToken(styles, '--status-warning', FALLBACK_TOKENS.statusWarning),
    statusInfo: readToken(styles, '--status-info', FALLBACK_TOKENS.statusInfo),
  };
}

/**
 * Wrap a CSS color in a `color-mix` so we can derive translucent surfaces
 * (selection, active line) regardless of the source color space (oklch/hex).
 */
function withAlpha(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/**
 * Build the editor view theme (chrome: gutters, cursor, selection, scrollbars)
 * from probed tokens.
 */
function buildViewTheme(tokens: EditorTokens, dark: boolean): Extension {
  return EditorView.theme(
    {
      '&': {
        color: tokens.foreground,
        backgroundColor: 'transparent',
        height: '100%',
        fontSize: '13px',
      },
      '.cm-content': {
        caretColor: tokens.primary,
        fontFamily:
          "var(--font-mono, 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace)",
        padding: '8px 0',
      },
      '.cm-scroller': {
        fontFamily:
          "var(--font-mono, 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace)",
        lineHeight: '1.5',
      },
      '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, ::selection': {
        backgroundColor: withAlpha(tokens.primary, 28),
      },
      '.cm-selectionBackground': {
        backgroundColor: withAlpha(tokens.primary, 18),
      },
      '&.cm-focused .cm-cursor': {
        borderLeftColor: tokens.primary,
        borderLeftWidth: '2px',
      },
      '.cm-activeLine': {
        backgroundColor: withAlpha(tokens.foreground, dark ? 4 : 6),
      },
      '.cm-activeLineGutter': {
        backgroundColor: withAlpha(tokens.foreground, dark ? 6 : 8),
        color: tokens.foregroundSecondary,
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: tokens.foregroundMuted,
        border: 'none',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 12px',
        minWidth: '2.5ch',
      },
      '.cm-foldGutter .cm-gutterElement': {
        color: tokens.foregroundMuted,
      },
      '.cm-matchingBracket': {
        backgroundColor: withAlpha(tokens.accent, 22),
        outline: `1px solid ${withAlpha(tokens.accent, 50)}`,
      },
      '.cm-nonmatchingBracket': {
        backgroundColor: withAlpha(tokens.statusError, 22),
      },
      '.cm-searchMatch': {
        backgroundColor: withAlpha(tokens.statusWarning, 30),
        outline: `1px solid ${withAlpha(tokens.statusWarning, 60)}`,
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: withAlpha(tokens.primary, 40),
      },
      '.cm-selectionMatch': {
        backgroundColor: withAlpha(tokens.accent, 16),
      },
      '.cm-tooltip': {
        backgroundColor: tokens.card,
        border: `1px solid ${tokens.border}`,
        color: tokens.foreground,
        borderRadius: '6px',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: withAlpha(tokens.primary, 20),
        color: tokens.foreground,
      },
      '.cm-panels': {
        backgroundColor: tokens.card,
        color: tokens.foreground,
      },
      '.cm-scroller::-webkit-scrollbar': {
        width: '10px',
        height: '10px',
      },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        backgroundColor: withAlpha(tokens.foreground, 16),
        borderRadius: '6px',
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        backgroundColor: withAlpha(tokens.foreground, 28),
      },
    },
    { dark }
  );
}

/**
 * CodeMirror's `defaultHighlightStyle` ships a fixed light palette. We re-map
 * each of its default colors onto a theme token so syntax tones track the
 * active theme, while reusing the (otherwise unreachable) lezer `tag`
 * references the specs carry. Unknown default colors fall back to foreground.
 */
function defaultColorToToken(color: string | undefined, tokens: EditorTokens): string | undefined {
  switch (color) {
    case '#708': // keyword / modifier
      return tokens.primary;
    case '#219': // name / variable definition family
      return tokens.statusInfo;
    case '#164': // string / inserted
      return tokens.statusSuccess;
    case '#a11': // invalid / deleted
      return tokens.statusError;
    case '#e40': // literal / number / regexp
      return tokens.statusWarning;
    case '#00f': // bracket / meta
      return tokens.accent;
    case '#404740': // comment
      return tokens.foregroundMuted;
    case '#170': // alt string family in some specs
      return tokens.statusSuccess;
    case '#7d9029': // alt name family
      return tokens.accent;
    default:
      return color ? tokens.foreground : undefined;
  }
}

/**
 * Build a syntax highlight style from probed tokens by re-coloring the
 * default spec set.
 */
function buildHighlightStyle(tokens: EditorTokens): Extension {
  const specs = defaultHighlightStyle.specs.map(spec => {
    const recolored: Record<string, unknown> = { ...spec };
    if ('color' in spec) {
      recolored.color = defaultColorToToken(spec.color as string | undefined, tokens);
    }
    return recolored as (typeof defaultHighlightStyle.specs)[number];
  });
  return syntaxHighlighting(HighlightStyle.define(specs));
}

/** True when the active theme class implies a dark base. */
function isDarkActive(): boolean {
  if (typeof document === 'undefined') return true;
  const cls = document.documentElement.classList;
  // Plugin themes stamp an explicit `light`/`dark` base; built-ins are named.
  if (cls.contains('light')) return false;
  if (cls.contains('dark')) return true;
  const lightBuiltIns = ['paper'];
  for (const name of lightBuiltIns) {
    if (cls.contains(name)) return false;
  }
  return true;
}

/**
 * Build the full editor theme extension array from the currently-active CSS
 * tokens. Call once per theme generation; combine with language + base
 * extensions in {@link EditorPane}.
 */
export function buildEditorTheme(): Extension {
  const tokens = probeEditorTokens();
  const dark = isDarkActive();
  return [buildViewTheme(tokens, dark), buildHighlightStyle(tokens)];
}

/**
 * Observe theme changes (the `class` attribute on documentElement, the exact
 * surface `applyThemeToDOM` mutates) and invoke `onChange` so the editor can
 * rebuild its theme. Returns a disposer.
 */
export function observeEditorTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  let lastClass = document.documentElement.className;
  const observer = new MutationObserver(() => {
    const next = document.documentElement.className;
    if (next !== lastClass) {
      lastClass = next;
      onChange();
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => observer.disconnect();
}
