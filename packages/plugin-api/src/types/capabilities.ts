/**
 * Provider Capability Types
 *
 * Capabilities are declared as a typed object on the provider plugin.
 * The core reads capabilities to determine what UI to show and what
 * optional methods to call. Capabilities are immutable after activation.
 */

/**
 * Session operations that a provider can support.
 * Each operation is declared individually via `supportedOperations`.
 *
 * - `'resume'`   - Resume an existing session by its ID
 * - `'fork'`     - Fork a new session from an existing one
 * - `'continue'` - Continue the most recent session for a project
 */
export type SessionOperation = 'resume' | 'fork' | 'continue';

/**
 * Declares what optional features a provider supports.
 *
 * The core adapts its UI per-session based on these flags:
 * - If `supportsMcp` is false, MCP configuration UI is hidden for this provider's sessions
 * - If `supportsUsage` is false, the usage panel is hidden
 * - If `supportsSessionHistory` is false, session history is unavailable
 * - `supportedOperations` controls which session action buttons appear
 *
 * @example
 * ```typescript
 * // Claude provider with full capabilities
 * get capabilities(): ProviderCapabilities {
 *   return {
 *     supportsMcp: true,
 *     supportsUsage: true,
 *     supportsSessionHistory: true,
 *     supportedOperations: new Set(['resume', 'fork', 'continue']),
 *   };
 * }
 *
 * // Minimal provider with no optional features
 * get capabilities(): ProviderCapabilities {
 *   return {
 *     supportsMcp: false,
 *     supportsUsage: false,
 *     supportsSessionHistory: false,
 *     supportedOperations: new Set(),
 *   };
 * }
 * ```
 */
export interface ProviderCapabilities {
  /** Whether this provider's CLI supports MCP server configuration */
  supportsMcp: boolean;

  /** Whether this provider can report usage metrics */
  supportsUsage: boolean;

  /** Whether this provider can read session history from disk */
  supportsSessionHistory: boolean;

  /** Set of session operations this provider supports (resume, fork, continue) */
  supportedOperations: Set<SessionOperation>;
}
