/**
 * Plugin Theme Injector
 *
 * Runtime CSS injection utility for plugin-provided themes.
 * Plugins register themes with CSS custom properties, and this module
 * injects/removes <style> elements in document.head at runtime.
 *
 * Theme rules are scoped to `:root.{themeId}` so they only apply when
 * the theme class is set on the root element (same as built-in themes).
 */

import { ALL_THEMES } from '@omniscribe/shared';

/** Attribute used to identify plugin theme style elements in the DOM */
const THEME_ATTR = 'data-plugin-theme';

/**
 * Inject CSS custom property styles for a plugin theme.
 *
 * Creates a <style> element with `:root.{themeId} { ... }` rules
 * containing the given CSS custom properties. If styles for the same
 * themeId already exist, they are replaced (prevents duplicates on
 * re-registration).
 *
 * @param themeId - Unique theme identifier (should be prefixed, e.g., `plugin-{pluginId}-{name}`)
 * @param cssProperties - Map of CSS variable names to values (e.g., `{ '--background': '240 10% 3.9%' }`)
 */
export function injectThemeStyles(themeId: string, cssProperties: Record<string, string>): void {
  // Remove existing styles for this theme (prevent duplicates)
  removeThemeStyles(themeId);

  const declarations = Object.entries(cssProperties)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  const css = `:root.${themeId} {\n${declarations}\n}`;

  const style = document.createElement('style');
  style.setAttribute(THEME_ATTR, themeId);
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * Remove injected CSS styles for a plugin theme.
 *
 * Queries for the <style> element with the matching `data-plugin-theme`
 * attribute and removes it from the DOM.
 *
 * @param themeId - The theme identifier to remove styles for
 */
export function removeThemeStyles(themeId: string): void {
  const existing = document.head.querySelector(`style[${THEME_ATTR}="${themeId}"]`);
  if (existing) {
    existing.remove();
  }
}

/**
 * Check whether a theme ID matches a built-in theme.
 *
 * Used to prevent plugin themes from colliding with core theme IDs.
 * Plugin themes should use prefixed IDs like `plugin-{pluginId}-{themeName}`.
 *
 * @param themeId - The theme identifier to check
 * @returns `true` if the ID matches a built-in theme
 */
export function isBuiltinThemeId(themeId: string): boolean {
  return (ALL_THEMES as string[]).includes(themeId);
}
