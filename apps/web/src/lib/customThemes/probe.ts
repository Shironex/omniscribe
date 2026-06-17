/**
 * Resolve the currently-active theme's tokens off the live DOM.
 *
 * Used by the "starter template" export: the user gets a JSON pre-filled with
 * the *resolved* values of whichever theme is active (oklch/hex already
 * computed by the browser), giving them a correct, editable starting point
 * rather than a blank slate.
 *
 * This is a general superset of `editorTheme.ts#probeEditorTokens` (which only
 * reads the ~13 tokens the editor needs). It deliberately lives in
 * `customThemes/` so the editor's probe stays narrowly scoped.
 */
import { CORE_THEME_TOKENS, type CustomTheme, type TokenName } from './schema';

/** Tokens excluded from the starter export — they're box-shadow strings, not colors. */
const NON_COLOR_TOKENS: ReadonlySet<string> = new Set([
  '--shadow-xs',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--shadow-xl',
]);

/**
 * Read every core color token off `document.documentElement` (where
 * `applyThemeToDOM` stamps the active theme class). Returns a sparse map —
 * tokens that resolve empty (jsdom without the stylesheet) are omitted.
 */
export function probeActiveThemeColors(): Partial<Record<TokenName, string>> {
  const out: Partial<Record<TokenName, string>> = {};
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') {
    return out;
  }
  const styles = getComputedStyle(document.documentElement);
  for (const token of CORE_THEME_TOKENS) {
    if (NON_COLOR_TOKENS.has(token)) continue;
    const value = styles.getPropertyValue(token).trim();
    if (value.length > 0) {
      out[token] = value;
    }
  }
  return out;
}

/** True when the currently-active built-in/base theme is a light theme. */
export function isActiveThemeLight(): boolean {
  if (typeof document === 'undefined') return false;
  const cls = document.documentElement.classList;
  if (cls.contains('light')) return true;
  if (cls.contains('dark')) return false;
  // Built-in light themes (keep in sync with BUILT_IN_THEMES isDark=false).
  return cls.contains('paper');
}

/**
 * Build a {@link CustomTheme} starter from the currently-active theme's
 * resolved tokens. The caller may override the slug/label.
 */
export function buildStarterTheme(slug: string, label: string): CustomTheme {
  return {
    id: slug,
    label,
    isDark: !isActiveThemeLight(),
    colors: probeActiveThemeColors(),
  };
}
