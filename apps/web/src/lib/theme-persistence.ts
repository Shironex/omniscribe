import {
  ALL_THEMES,
  DEFAULT_BUILT_IN_THEME,
  LEGACY_THEME_MIGRATION,
  type Theme,
} from '@omniscribe/shared';
import { themeOptions } from '@/lib/theme';
import { isCustomThemeId } from '@/lib/customThemes/schema';
import { getCustomTheme } from '@/lib/customThemes/store';

/**
 * localStorage key for persisted theme.
 */
export const THEME_STORAGE_KEY = 'omniscribe-theme';

/**
 * Set of dark theme values, derived from the curated catalog.
 */
const darkThemeSet: Set<string> = new Set(themeOptions.filter(t => t.isDark).map(t => t.value));

/**
 * Set of all built-in theme IDs from the curated catalog.
 */
const builtInThemeSet: Set<string> = new Set(ALL_THEMES);

/** Matches valid CSS class names: starts with a letter, only alphanumeric/hyphens/underscores. */
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
 * Read the persisted theme from localStorage, applying the legacy-theme migration.
 *
 * The catalog was simplified from 41 themes to 8. Users who had a retired theme
 * (e.g. `monokai`, `solarized`, `gruvboxlight`) are silently remapped to the
 * closest match in the new catalog via {@link LEGACY_THEME_MIGRATION}, and the
 * migrated value is rewritten to localStorage so the migration runs at most once.
 *
 * Plugin themes (arbitrary IDs registered at runtime) are passed through so they
 * can hydrate after the plugin store loads.
 *
 * Custom themes (namespaced `custom:{slug}`) are resolved against the
 * custom-theme registry: a still-present custom theme is passed through; one
 * that was deleted (id persisted but no longer registered) falls back to the
 * default built-in theme so the next load can't strand the app on a missing
 * theme.
 *
 * Returns {@link DEFAULT_BUILT_IN_THEME} (`'forge'`) when nothing is stored or
 * localStorage is unavailable.
 */
export function getPersistedTheme(): string {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    if (!stored) {
      return DEFAULT_BUILT_IN_THEME;
    }

    // Custom theme (`custom:{slug}`) — handled before VALID_THEME_ID because the
    // namespace colon would otherwise fail that pattern. Fall back to default if
    // the referenced custom theme no longer exists.
    if (isCustomThemeId(stored)) {
      return getCustomTheme(stored) ? stored : DEFAULT_BUILT_IN_THEME;
    }

    // Empty / invalid → default
    if (!VALID_THEME_ID.test(stored)) {
      return DEFAULT_BUILT_IN_THEME;
    }

    // Already a valid built-in theme → keep
    if (builtInThemeSet.has(stored)) {
      return stored;
    }

    // Retired legacy theme → migrate, persist the new ID, return it
    if (isLegacyTheme(stored)) {
      const migrated = LEGACY_THEME_MIGRATION[stored];
      persistTheme(migrated);
      return migrated;
    }

    // Otherwise — assume plugin theme ID; pass through unchanged.
    return stored;
  } catch {
    return DEFAULT_BUILT_IN_THEME;
  }
}

/**
 * Check whether a given theme name corresponds to a dark theme.
 * Uses the dark theme set derived from the curated catalog; custom themes
 * report their own `isDark` flag from the registry.
 */
export function isPersistedThemeDark(theme: string): boolean {
  if (isCustomThemeId(theme)) {
    return getCustomTheme(theme)?.isDark ?? true;
  }
  return darkThemeSet.has(theme);
}

export function isLegacyTheme(theme: string): theme is keyof typeof LEGACY_THEME_MIGRATION {
  return Object.prototype.hasOwnProperty.call(LEGACY_THEME_MIGRATION, theme);
}

/**
 * Resolve any (possibly retired) theme ID to a built-in theme.
 * Returns {@link DEFAULT_BUILT_IN_THEME} if no migration applies.
 */
export function migrateLegacyTheme(theme: string): Theme {
  if (builtInThemeSet.has(theme)) return theme as Theme;
  if (isLegacyTheme(theme)) return LEGACY_THEME_MIGRATION[theme];
  return DEFAULT_BUILT_IN_THEME;
}
