import type { LucideIcon } from 'lucide-react';
import { Palette, Brush } from 'lucide-react';
import { BUILT_IN_THEMES, type Theme, type ThemeMeta } from '@omniscribe/shared';
import { type CustomTheme, customThemeId, deriveSwatch } from '@/lib/customThemes/schema';

/**
 * Renderer-side theme option, derived from the shared catalog. The icon and
 * test-id are renderer concerns; identity / colour / dark-mode is shared.
 */
export interface ThemeOption {
  /** Built-in `Theme` for curated entries; arbitrary string for plugin-registered themes. */
  value: Theme | (string & {});
  label: string;
  Icon: LucideIcon;
  testId: string;
  isDark: boolean;
  /** Primary brand color (legacy field — kept for plugin compat). */
  color: string;
  /** Four-tile palette quartet rendered in the swatch grid. */
  swatch: ThemeMeta['swatch'];
}

/**
 * Curated theme catalog for the renderer. Order matches the design grid.
 * Icons are intentionally a single Palette glyph — the visual identity
 * comes from the swatch quartet, not the icon.
 */
export const themeOptions: ReadonlyArray<ThemeOption> = BUILT_IN_THEMES.map(meta => ({
  value: meta.value,
  label: meta.label,
  Icon: Palette,
  testId: `${meta.value}-mode-button`,
  isDark: meta.isDark,
  color: meta.swatch.primary,
  swatch: meta.swatch,
}));

/** Helper: dark themes only. */
export const darkThemes = themeOptions.filter(t => t.isDark);

/** Helper: light themes only. */
export const lightThemes = themeOptions.filter(t => !t.isDark);

/** Helper: look up a theme option by id. */
export function getThemeOption(theme: Theme): ThemeOption | undefined {
  return themeOptions.find(t => t.value === theme);
}

/**
 * Convert a user-authored {@link CustomTheme} into a {@link ThemeOption} so it
 * can render in the same swatch grid as built-in / plugin themes. The swatch
 * quartet is derived from the theme's bg/surface/primary/accent tokens (sparse
 * themes fall back gracefully via {@link deriveSwatch}). The option `value` is
 * the runtime-namespaced id (`custom:{slug}`).
 */
export function customThemeToOption(theme: CustomTheme): ThemeOption {
  const swatch = deriveSwatch(theme);
  return {
    value: customThemeId(theme.id),
    label: theme.label,
    Icon: Brush,
    testId: `custom-theme-${theme.id}`,
    isDark: theme.isDark,
    color: swatch.primary,
    swatch,
  };
}
