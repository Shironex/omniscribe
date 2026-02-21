import { themeOptions } from '@/lib/theme';

/**
 * localStorage key for persisted theme.
 */
export const THEME_STORAGE_KEY = 'omniscribe-theme';

/**
 * Set of dark theme values, derived from the single source of truth in theme.ts.
 */
const darkThemeSet: Set<string> = new Set(themeOptions.filter(t => t.isDark).map(t => t.value));

/** Matches valid CSS class names: starts with a letter, only alphanumeric/hyphens/underscores, max 100 chars. */
const VALID_THEME_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/;

/**
 * Persist the current theme to localStorage for instant restoration on next startup.
 * Wrapped in try/catch because localStorage may be unavailable (e.g. incognito quota).
 */
export function persistTheme(theme: string): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/**
 * Read the persisted theme from localStorage.
 * Returns 'dark' as a safe fallback if nothing is stored or localStorage is unavailable.
 *
 * Accepts any non-empty stored value (not just built-in themes) because plugin
 * themes use arbitrary string IDs that aren't known until plugins load later.
 */
export function getPersistedTheme(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    // Accept non-empty values that look like valid CSS class names
    // (plugin themes use arbitrary IDs not known until plugins load)
    return stored && VALID_THEME_ID.test(stored) ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * Check whether a given theme name corresponds to a dark theme.
 * Uses the dark theme set derived from themeOptions.
 */
export function isPersistedThemeDark(theme: string): boolean {
  return darkThemeSet.has(theme);
}
