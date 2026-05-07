import type { LucideIcon } from 'lucide-react';
import { Palette } from 'lucide-react';
import { BUILT_IN_THEMES, type Theme, type ThemeMeta } from '@omniscribe/shared';

/**
 * Renderer-side theme option, derived from the shared catalog. The icon and
 * test-id are renderer concerns; identity / colour / dark-mode is shared.
 */
export interface ThemeOption {
  value: Theme;
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
