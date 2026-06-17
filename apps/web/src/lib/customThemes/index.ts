/**
 * Custom user themes — public surface.
 *
 * Custom themes cascade over a built-in base (dark/light) via an injected
 * `<style id="omniscribe-custom-themes">` element + a `custom-{slug}` DOM class,
 * mirroring the plugin-theme mechanism. Runtime/persisted ids are namespaced
 * `custom:{slug}` so they never collide with built-in, plugin, or legacy ids.
 */
export {
  type CustomTheme,
  type TokenName,
  type CoreTokenName,
  type AnsiTokenName,
  type ValidationResult,
  type ThemeSwatch,
  CORE_THEME_TOKENS,
  ANSI_THEME_TOKENS,
  ALL_THEME_TOKENS,
  CUSTOM_THEME_PREFIX,
  validateCustomTheme,
  isValidCssColor,
  customThemeId,
  isCustomThemeId,
  customThemeSlug,
  deriveSwatch,
  deriveAnsiFallback,
} from './schema';

export {
  type CustomThemesStore,
  type AddResult,
  useCustomThemesStore,
  selectCustomThemes,
  getCustomTheme,
  customThemeDomClass,
  serializeCustomTheme,
  downloadCustomTheme,
  MAX_CUSTOM_THEMES,
  CUSTOM_THEMES_STORAGE_KEY,
  CUSTOM_THEME_STYLE_ELEMENT_ID,
} from './store';

export { probeActiveThemeColors, buildStarterTheme, isActiveThemeLight } from './probe';
