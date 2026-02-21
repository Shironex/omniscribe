/**
 * Plugin Theme Injector
 *
 * Runtime CSS injection utility for plugin-provided themes.
 * Plugins register themes with CSS custom properties, and this module
 * injects/removes <style> elements in document.head at runtime.
 *
 * Theme rules are scoped to `:root.{themeId}` so they only apply when
 * the theme class is set on the root element (same as built-in themes).
 *
 * All inputs are validated/sanitized to prevent CSS injection attacks.
 */

import { ALL_THEMES } from '@omniscribe/shared';

/** Attribute used to identify plugin theme style elements in the DOM */
const THEME_ATTR = 'data-plugin-theme';

/** Valid theme ID: starts with a letter, alphanumeric/hyphens/underscores, max 101 chars total. */
const VALID_THEME_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,100}$/;

/** Valid CSS custom property key: must start with `--` followed by a letter and alphanumeric/hyphens. */
const VALID_CSS_PROPERTY_KEY = /^--[a-zA-Z][a-zA-Z0-9-]*$/;

/** Characters/patterns that could break out of a CSS declaration block, inject declarations, or load external resources. */
const DANGEROUS_CSS_VALUE = /[{};]|<\/style|url\s*\(|expression\s*\(/i;

/**
 * Validate that a theme ID is safe for CSS interpolation.
 *
 * Must match the pattern used by theme-persistence.ts — starts with a letter,
 * only contains alphanumeric characters, hyphens, or underscores, up to 101 characters
 * (1 required + up to 100 additional).
 *
 * @param themeId - The theme identifier to validate
 * @returns `true` if the ID is safe to use in CSS selectors
 */
export function isValidThemeId(themeId: string): boolean {
  return VALID_THEME_ID.test(themeId);
}

/**
 * Validate that a CSS property key is a valid custom property name.
 *
 * @param key - The CSS property key to validate
 * @returns `true` if the key is a valid CSS custom property name
 */
export function isValidCssPropertyKey(key: string): boolean {
  return VALID_CSS_PROPERTY_KEY.test(key);
}

/**
 * Check whether a CSS property value contains dangerous characters
 * that could break out of a CSS declaration block.
 *
 * @param value - The CSS value to check
 * @returns `true` if the value is safe (no dangerous characters)
 */
export function isSafeCssValue(value: string): boolean {
  return !DANGEROUS_CSS_VALUE.test(value);
}

/**
 * Inject CSS custom property styles for a plugin theme.
 *
 * Creates a <style> element with `:root.{themeId} { ... }` rules
 * containing the given CSS custom properties. If styles for the same
 * themeId already exist, they are replaced (prevents duplicates on
 * re-registration).
 *
 * All inputs are validated before interpolation to prevent CSS injection.
 *
 * @param themeId - Unique theme identifier (should be prefixed, e.g., `plugin-{pluginId}-{name}`)
 * @param cssProperties - Map of CSS variable names to values (e.g., `{ '--background': '240 10% 3.9%' }`)
 * @returns `true` if styles were injected, `false` if validation failed
 */
export function injectThemeStyles(themeId: string, cssProperties: Record<string, string>): boolean {
  if (!isValidThemeId(themeId)) {
    return false;
  }

  // Validate and filter CSS properties
  const safeEntries = Object.entries(cssProperties).filter(
    ([key, value]) => isValidCssPropertyKey(key) && isSafeCssValue(value)
  );

  if (safeEntries.length === 0) {
    return false;
  }

  // Remove existing styles for this theme (prevent duplicates)
  removeThemeStyles(themeId);

  const declarations = safeEntries.map(([key, value]) => `  ${key}: ${value};`).join('\n');

  const css = `:root.${themeId} {\n${declarations}\n}`;

  const style = document.createElement('style');
  style.setAttribute(THEME_ATTR, themeId);
  style.textContent = css;
  document.head.appendChild(style);
  return true;
}

/**
 * Remove injected CSS styles for a plugin theme.
 *
 * Queries for the <style> element with the matching `data-plugin-theme`
 * attribute and removes it from the DOM. Uses CSS.escape() for safe
 * attribute selector construction.
 *
 * @param themeId - The theme identifier to remove styles for
 */
export function removeThemeStyles(themeId: string): void {
  // Validate even for removal — only process IDs that could have been injected
  if (!isValidThemeId(themeId)) return;

  // Use CSS.escape when available (browsers), fall back to validated ID (jsdom/tests).
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(themeId) : themeId;
  const existing = document.head.querySelector(`style[${THEME_ATTR}="${escaped}"]`);
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
