/**
 * Provider Session Status Types
 *
 * Defines the normalized session status values that all providers
 * must map their CLI output to. These are a subset of the core
 * SessionStatus values -- representing states that a provider's
 * terminal output can indicate.
 */

/**
 * Normalized session status as reported by a provider.
 *
 * Providers parse their CLI's terminal output and map it to one of these values.
 * The core may have additional internal statuses (connecting, disconnected, etc.)
 * that are not provider-reported.
 *
 * - `'idle'`        - Waiting for user input (prompt visible)
 * - `'working'`     - Actively processing (generating code, running tools)
 * - `'planning'`    - Planning phase before execution
 * - `'needs_input'` - Blocked on user decision or confirmation
 * - `'finished'`    - Session completed normally
 * - `'error'`       - Session encountered an error
 */
export type ProviderSessionStatus =
  | 'idle'
  | 'working'
  | 'planning'
  | 'needs_input'
  | 'finished'
  | 'error';
