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
export type { AiProviderPlugin, ProviderPluginContext } from './types/provider';

// ==========================================
// Base Classes
// ==========================================
export { BaseProviderPlugin } from './base/BaseProviderPlugin';
