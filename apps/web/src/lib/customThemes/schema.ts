/**
 * Custom-theme schema + hand-rolled validator.
 *
 * Custom themes are user-authored palettes that cascade over a built-in base
 * (dark/light) the exact same way plugin themes do — by injecting a
 * `:root.{id} { ...custom props... }` stylesheet and stamping the theme class
 * on the document root. See {@link file://./store.ts}.
 *
 * `zod` is intentionally NOT a dependency of `apps/web` (only `apps/mcp-server`
 * ships it), so this module hand-rolls a small, dependency-free validator. The
 * validation surface is deliberately tight because the parsed colors are
 * interpolated into a live `<style>` element — every value is checked for CSS
 * injection (mirrors `plugin-theme-injector.ts`) AND for being a real CSS color
 * via `CSS.supports('color', v)`.
 */

/**
 * The canonical core token list, extracted verbatim from the built-in theme CSS
 * (`apps/web/src/styles/themes/forge.css`). Every built-in theme defines exactly
 * this set, so a custom theme that provides values for these tokens fully
 * re-skins the app. A custom theme need only supply the tokens it wants to
 * override — anything omitted inherits from the dark/light base class.
 *
 * Shadows (`--shadow-*`) are intentionally excluded from the *user-editable*
 * surface: they are box-shadow strings (not colors) and would fail color
 * validation. They inherit from the base. Likewise the `--swatch-*` quartet is
 * derived, not authored (see {@link deriveSwatch}).
 */
export const CORE_THEME_TOKENS = [
  // Backgrounds
  '--background',
  '--background-50',
  '--background-80',
  // Text
  '--foreground',
  '--foreground-secondary',
  '--foreground-muted',
  // Surfaces
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  // Brand
  '--primary',
  '--primary-foreground',
  '--brand-400',
  '--brand-500',
  '--brand-600',
  // Muted / secondary
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--accent-foreground',
  // Borders / inputs
  '--destructive',
  '--border',
  '--border-glass',
  '--input',
  '--ring',
  // Charts
  '--chart-1',
  '--chart-2',
  '--chart-3',
  '--chart-4',
  '--chart-5',
  // Sidebar
  '--sidebar',
  '--sidebar-foreground',
  '--sidebar-primary',
  '--sidebar-primary-foreground',
  '--sidebar-accent',
  '--sidebar-accent-foreground',
  '--sidebar-border',
  '--sidebar-ring',
  // Actions
  '--action-view',
  '--action-view-hover',
  '--action-followup',
  '--action-followup-hover',
  '--action-commit',
  '--action-commit-hover',
  '--action-verify',
  '--action-verify-hover',
  '--running-indicator',
  '--running-indicator-text',
  // Status
  '--status-success',
  '--status-success-bg',
  '--status-warning',
  '--status-warning-bg',
  '--status-error',
  '--status-error-bg',
  '--status-info',
  '--status-info-bg',
  '--status-pending',
  '--status-pending-bg',
  '--status-accent',
  '--status-accent-bg',
  '--status-backlog',
  '--status-in-progress',
  '--status-waiting',
] as const;

/**
 * Optional ANSI palette extension (16 tokens — the 8 base + 8 bright colors).
 *
 * The built-in CSS themes do *not* currently define these (the integrated
 * terminal sources its colors from the named `terminal-themes.ts` registry),
 * so these tokens are an opt-in, forward-compatible surface a custom theme may
 * supply. They are validated like any other color token but are not required;
 * {@link deriveAnsiFallback} fills a sensible 16-color ramp from the core
 * palette when a theme omits them, so consumers can always read a full ANSI
 * set off a custom theme.
 */
export const ANSI_THEME_TOKENS = [
  '--terminal-ansi-black',
  '--terminal-ansi-red',
  '--terminal-ansi-green',
  '--terminal-ansi-yellow',
  '--terminal-ansi-blue',
  '--terminal-ansi-magenta',
  '--terminal-ansi-cyan',
  '--terminal-ansi-white',
  '--terminal-ansi-bright-black',
  '--terminal-ansi-bright-red',
  '--terminal-ansi-bright-green',
  '--terminal-ansi-bright-yellow',
  '--terminal-ansi-bright-blue',
  '--terminal-ansi-bright-magenta',
  '--terminal-ansi-bright-cyan',
  '--terminal-ansi-bright-white',
] as const;

/** Union of every token name a custom theme may legally provide. */
export const ALL_THEME_TOKENS = [...CORE_THEME_TOKENS, ...ANSI_THEME_TOKENS] as const;

/** A core (always-defined-by-built-ins) token name. */
export type CoreTokenName = (typeof CORE_THEME_TOKENS)[number];
/** An optional ANSI token name. */
export type AnsiTokenName = (typeof ANSI_THEME_TOKENS)[number];
/** Any token a custom theme may set. */
export type TokenName = CoreTokenName | AnsiTokenName;

/** Set form for O(1) membership checks during validation. */
const VALID_TOKEN_SET: ReadonlySet<string> = new Set(ALL_THEME_TOKENS);
const CORE_TOKEN_SET: ReadonlySet<string> = new Set(CORE_THEME_TOKENS);

/**
 * A user-authored theme. Colors is a sparse map — only the tokens the author
 * chose to override. `id` is the bare slug (NOT yet namespaced); the runtime
 * `custom:`-prefixed id is produced by {@link customThemeId}.
 */
export interface CustomTheme {
  /** Bare slug, e.g. `my-midnight`. Namespaced to `custom:my-midnight` at runtime. */
  id: string;
  /** Human-readable name shown in the swatch grid. */
  label: string;
  /** Whether the theme cascades over the `dark` (true) or `light` (false) base. */
  isDark: boolean;
  /** Sparse map of CSS custom property → CSS color value. */
  colors: Partial<Record<TokenName, string>>;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Theme id slug: letters/digits/hyphens/underscores, must start with a letter. */
export const SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,48}$/;
/** Max label length (chars). */
export const MAX_LABEL_LENGTH = 48;
/** Max number of color overrides per theme (guards serialized size). */
export const MAX_COLORS_PER_THEME = ALL_THEME_TOKENS.length;
/** A theme must define at least these core tokens to render meaningfully. */
export const MIN_REQUIRED_TOKENS: readonly CoreTokenName[] = [
  '--background',
  '--foreground',
  '--primary',
];

/** The runtime id namespace prefix that avoids collisions with built-ins/plugins/legacy. */
export const CUSTOM_THEME_PREFIX = 'custom:';

/** Produce the runtime (namespaced) theme id from a bare slug. */
export function customThemeId(slug: string): string {
  return `${CUSTOM_THEME_PREFIX}${slug}`;
}

/** True when a (possibly namespaced) theme id belongs to the custom namespace. */
export function isCustomThemeId(id: string): boolean {
  return id.startsWith(CUSTOM_THEME_PREFIX);
}

/** Strip the `custom:` prefix to recover the bare slug. Returns the input verbatim if unprefixed. */
export function customThemeSlug(id: string): string {
  return isCustomThemeId(id) ? id.slice(CUSTOM_THEME_PREFIX.length) : id;
}

// ---------------------------------------------------------------------------
// Color validation
// ---------------------------------------------------------------------------

/**
 * Characters/patterns that could break out of a CSS declaration block, inject
 * declarations, or load external resources. Mirrors `plugin-theme-injector.ts`
 * so the same hardening applies on the custom-theme path.
 */
const DANGEROUS_CSS_VALUE = /[{};]|<\/style|url\s*\(|expression\s*\(/i;

/**
 * Validate that a string is a real, safe CSS color.
 *
 * Two gates:
 *  1. No CSS-injection characters (defense-in-depth — the value is interpolated
 *     into a live stylesheet).
 *  2. The browser actually recognizes it as a color via `CSS.supports`. In
 *     jsdom/SSR (no `CSS.supports`) we fall back to a conservative syntactic
 *     check so unit tests of the validator still discriminate good vs. bad.
 */
export function isValidCssColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 128) return false;
  if (DANGEROUS_CSS_VALUE.test(trimmed)) return false;

  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
    return CSS.supports('color', trimmed);
  }
  // jsdom / SSR fallback: accept hex, rg[ba]/hsl[a]/oklch/oklab/lab/lch/color(),
  // and bare CSS named colors (a single identifier).
  return (
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed) ||
    /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)$/i.test(trimmed) ||
    /^[a-z]+$/i.test(trimmed)
  );
}

// ---------------------------------------------------------------------------
// Theme validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** Present only when `ok` — the normalized, trusted theme. */
  theme?: CustomTheme;
}

/**
 * Validate + normalize an untrusted value (e.g. a parsed JSON import) into a
 * {@link CustomTheme}. Rejects: non-objects, bad slug, over-length label,
 * unknown color keys, non-color values, missing required tokens, and oversized
 * color maps. Returns a typed result with a flat error list suitable for a
 * toast.
 */
export function validateCustomTheme(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['Theme must be a JSON object.'] };
  }

  const obj = input as Record<string, unknown>;

  // Reject unexpected top-level keys (typo / tampering signal).
  const ALLOWED_TOP_LEVEL = new Set(['id', 'label', 'isDark', 'colors']);
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      errors.push(`Unknown field "${key}".`);
    }
  }

  // id
  const id = obj.id;
  if (typeof id !== 'string' || !SLUG_PATTERN.test(id)) {
    errors.push(
      'Field "id" must be a slug: lowercase letters, digits, hyphens or underscores, starting with a letter (max 49 chars).'
    );
  }

  // label
  const label = obj.label;
  if (typeof label !== 'string' || label.trim().length === 0) {
    errors.push('Field "label" is required and must be a non-empty string.');
  } else if (label.length > MAX_LABEL_LENGTH) {
    errors.push(`Field "label" must be at most ${MAX_LABEL_LENGTH} characters.`);
  }

  // isDark
  const isDark = obj.isDark;
  if (typeof isDark !== 'boolean') {
    errors.push('Field "isDark" must be a boolean.');
  }

  // colors
  const rawColors = obj.colors;
  const normalizedColors: Partial<Record<TokenName, string>> = {};
  if (typeof rawColors !== 'object' || rawColors === null || Array.isArray(rawColors)) {
    errors.push('Field "colors" must be an object mapping token names to CSS colors.');
  } else {
    const entries = Object.entries(rawColors as Record<string, unknown>);
    if (entries.length > MAX_COLORS_PER_THEME) {
      errors.push(`A theme may define at most ${MAX_COLORS_PER_THEME} colors.`);
    }
    for (const [key, value] of entries) {
      if (!VALID_TOKEN_SET.has(key)) {
        errors.push(`Unknown color token "${key}".`);
        continue;
      }
      if (!isValidCssColor(value)) {
        errors.push(`Color "${key}" is not a valid CSS color.`);
        continue;
      }
      normalizedColors[key as TokenName] = (value as string).trim();
    }

    // Require a minimal renderable core so the theme isn't a no-op.
    for (const required of MIN_REQUIRED_TOKENS) {
      if (!(required in normalizedColors) && CORE_TOKEN_SET.has(required)) {
        errors.push(`Missing required color "${required}".`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    theme: {
      id: id as string,
      label: (label as string).trim(),
      isDark: isDark as boolean,
      colors: normalizedColors,
    },
  };
}

// ---------------------------------------------------------------------------
// Derivations (swatch + ANSI fallback)
// ---------------------------------------------------------------------------

/** Quartet of colors shown on the swatch card. */
export interface ThemeSwatch {
  bg: string;
  surface: string;
  primary: string;
  accent: string;
}

/**
 * Derive the 4-tile swatch from a theme's colors, falling back per-tile so a
 * sparse theme still renders a recognizable swatch. Light themes fall back
 * lighter, dark themes darker.
 */
export function deriveSwatch(theme: CustomTheme): ThemeSwatch {
  const c = theme.colors;
  const bgFallback = theme.isDark ? '#0e0e0e' : '#f8f8f8';
  const surfaceFallback = theme.isDark ? '#1a1a1a' : '#eeeeee';
  const accentFallbackBase =
    c['--accent'] ?? c['--primary'] ?? (theme.isDark ? '#5b9cf2' : '#3f7a4d');
  return {
    bg: c['--background'] ?? bgFallback,
    surface: c['--card'] ?? c['--secondary'] ?? surfaceFallback,
    primary: c['--primary'] ?? (theme.isDark ? '#e89143' : '#c75a40'),
    accent: accentFallbackBase,
  };
}

/**
 * Produce a full 16-color ANSI ramp for a custom theme. Author-provided ANSI
 * tokens win; anything omitted is derived from the core palette so a consumer
 * can always read a complete set. Returned keyed by the ANSI token names.
 */
export function deriveAnsiFallback(theme: CustomTheme): Record<AnsiTokenName, string> {
  const c = theme.colors;
  const fg = c['--foreground'] ?? (theme.isDark ? '#d4d4d4' : '#383a42');
  const bg = c['--background'] ?? (theme.isDark ? '#1e1e1e' : '#ffffff');
  const muted = c['--muted-foreground'] ?? c['--foreground-muted'] ?? '#888888';
  const red = c['--status-error'] ?? c['--destructive'] ?? '#e05252';
  const green = c['--status-success'] ?? '#3fb950';
  const yellow = c['--status-warning'] ?? '#d6a23a';
  const blue = c['--status-info'] ?? c['--accent'] ?? '#5b8def';
  const magenta = c['--primary'] ?? '#c678dd';
  const cyan = c['--status-accent'] ?? c['--accent'] ?? '#56b6c2';

  const pick = (token: AnsiTokenName, fallback: string): string => c[token] ?? fallback;

  return {
    '--terminal-ansi-black': pick('--terminal-ansi-black', bg),
    '--terminal-ansi-red': pick('--terminal-ansi-red', red),
    '--terminal-ansi-green': pick('--terminal-ansi-green', green),
    '--terminal-ansi-yellow': pick('--terminal-ansi-yellow', yellow),
    '--terminal-ansi-blue': pick('--terminal-ansi-blue', blue),
    '--terminal-ansi-magenta': pick('--terminal-ansi-magenta', magenta),
    '--terminal-ansi-cyan': pick('--terminal-ansi-cyan', cyan),
    '--terminal-ansi-white': pick('--terminal-ansi-white', fg),
    '--terminal-ansi-bright-black': pick('--terminal-ansi-bright-black', muted),
    '--terminal-ansi-bright-red': pick('--terminal-ansi-bright-red', red),
    '--terminal-ansi-bright-green': pick('--terminal-ansi-bright-green', green),
    '--terminal-ansi-bright-yellow': pick('--terminal-ansi-bright-yellow', yellow),
    '--terminal-ansi-bright-blue': pick('--terminal-ansi-bright-blue', blue),
    '--terminal-ansi-bright-magenta': pick('--terminal-ansi-bright-magenta', magenta),
    '--terminal-ansi-bright-cyan': pick('--terminal-ansi-bright-cyan', cyan),
    '--terminal-ansi-bright-white': pick('--terminal-ansi-bright-white', fg),
  };
}
