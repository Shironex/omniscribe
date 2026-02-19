/**
 * Theme Registration Types
 *
 * Plugins can register custom themes by providing CSS custom property values.
 * The core theme system applies these properties when the theme is selected.
 */

import type { PluginComponentType } from './frontend';

/**
 * Registration for a plugin-provided theme.
 *
 * Themes are declared as a set of CSS custom properties that override the
 * default theme variables. The core applies these when the user selects the theme.
 *
 * @example
 * ```typescript
 * context.registerTheme({
 *   id: 'my-dark-theme',
 *   label: 'My Dark Theme',
 *   isDark: true,
 *   color: '#1a1a2e',
 *   cssProperties: {
 *     '--background': '240 10% 3.9%',
 *     '--foreground': '0 0% 98%',
 *     '--primary': '240 5.9% 10%',
 *   },
 * });
 * ```
 */
export interface ThemeRegistration {
  /** Unique theme identifier (must not conflict with built-in themes) */
  id: string;

  /** Human-readable theme name shown in the appearance settings */
  label: string;

  /** Whether this is a dark theme (affects system UI elements) */
  isDark: boolean;

  /** Preview color shown in the theme picker (hex color) */
  color: string;

  /** Optional icon component for the theme picker */
  icon?: PluginComponentType;

  /**
   * CSS custom properties to set when this theme is active.
   * Keys are CSS variable names (e.g., '--background'), values are the
   * CSS values to set (e.g., '240 10% 3.9%' for HSL).
   */
  cssProperties: Record<string, string>;
}
