/**
 * @omniscribe/plugin-api
 *
 * Plugin API contracts for Omniscribe.
 * This package defines the interfaces, types, and base classes that
 * plugins implement to integrate with the Omniscribe platform.
 *
 * Zero runtime dependencies. Pure TypeScript types and thin abstract classes.
 *
 * @packageDocumentation
 */

// ==========================================
// Manifest Types
// ==========================================
export type { PluginType, PluginManifest, ManifestValidationResult } from './types/manifest';

// ==========================================
// Base Plugin Types
// ==========================================
export type { OmniscribePlugin, PluginContext, PluginLogger, Disposable } from './types/plugin';

// ==========================================
// Provider Capability Types
// ==========================================
export type { SessionOperation, ProviderCapabilities } from './types/capabilities';

// ==========================================
// CLI Types
// ==========================================
export type { CliDetectionResult, CliCommandConfig } from './types/cli';

// ==========================================
// Session Types
// ==========================================
export type { LaunchContext, ProviderSessionEntry, McpConfigContribution } from './types/session';

// ==========================================
// Usage Types
// ==========================================
export type { ProviderUsageData, UsageMetric } from './types/usage';

// ==========================================
// Status Types
// ==========================================
export type { ProviderSessionStatus } from './types/status';

// ==========================================
// Activation Types
// ==========================================
export type {
  ActivationEvent,
  ActivationEventWithMode,
  PluginActivation,
} from './types/activation';

// ==========================================
// Provider Plugin Interface
// ==========================================
export type {
  AiProviderPlugin,
  ProviderPluginContext,
  CustomChangelogFetcher,
} from './types/provider';
export { ALLOWED_PROVIDER_INVOKE_METHODS } from './types/provider';

// ==========================================
// Changelog Types
// ==========================================
export type {
  ChangelogEntry,
  ChangelogSourceKind,
  ChangelogSourceRegistration,
} from './types/changelog';

// ==========================================
// Frontend Plugin Types
// ==========================================
export type {
  PluginComponentType,
  PluginIconProps,
  PluginIconComponent,
  PluginSvgComponent,
  FrontendPlugin,
  FrontendPluginContext,
  SettingsSectionRegistration,
  SettingsCategoryRegistration,
  SessionStatusRendererRegistration,
  SessionStatusProps,
  UsagePanelRegistration,
  UsagePanelProps,
  TerminalHeaderActionRegistration,
  ActionBarItemRegistration,
  MoreMenuItemRegistration,
  TerminalActionContext,
} from './types/frontend';

// ==========================================
// Theme Types
// ==========================================
export type { ThemeRegistration } from './types/theme';

// ==========================================
// Base Classes
// ==========================================
export { BaseProviderPlugin } from './base/BaseProviderPlugin';
export { BaseFrontendPlugin } from './base/BaseFrontendPlugin';
export { BaseFullPlugin } from './base/BaseFullPlugin';

// ==========================================
// Utility Functions
// ==========================================
export { isProviderPlugin, isFrontendPlugin, isFullPlugin } from './utils/type-guards';
export { hasCapability, supportsOperation, getCapabilities } from './utils/capability';
export { validateManifest } from './utils/validation';
