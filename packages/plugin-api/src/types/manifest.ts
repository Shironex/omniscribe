/**
 * Plugin Manifest Types
 *
 * Defines the structure of the `omniscribe` field in a plugin's package.json.
 * The manifest contains minimal metadata for discovery and identification.
 * All behavioral configuration (capabilities, contributions, activation events)
 * is declared programmatically in the plugin's entry point.
 */

/**
 * What a plugin provides.
 *
 * - `'provider'` - Backend AI provider logic (CLI detection, command building, status parsing)
 * - `'frontend'` - Frontend UI contributions (settings sections, themes, status renderers)
 * - `'both'`     - Both provider logic and frontend UI in a single package
 */
export type PluginType = 'provider' | 'frontend' | 'both';

/**
 * Plugin manifest declared in a package's `omniscribe` field in package.json.
 *
 * @example
 * ```json
 * {
 *   "name": "@omniscribe/plugin-claude",
 *   "omniscribe": {
 *     "id": "claude",
 *     "type": "both",
 *     "displayName": "Claude Code",
 *     "description": "Claude Code CLI integration",
 *     "icon": "./assets/claude-icon.svg"
 *   }
 * }
 * ```
 */
export interface PluginManifest {
  /**
   * Unique plugin identifier.
   * Must be lowercase alphanumeric with hyphens only (e.g., 'claude', 'codex', 'my-provider').
   */
  id: string;

  /** What the plugin provides */
  type: PluginType;

  /** Human-readable name shown in the UI */
  displayName: string;

  /** Brief description of the plugin's purpose */
  description: string;

  /** Path to icon asset relative to the package root, or an icon name */
  icon?: string;
}

/**
 * Result of validating a plugin manifest.
 * Contains a list of human-readable error messages when validation fails.
 */
export interface ManifestValidationResult {
  /** Whether the manifest is valid */
  valid: boolean;

  /** Validation error messages (empty when valid) */
  errors: string[];
}
