import type { SessionStatus } from '../types/session';

/**
 * UI status for display purposes
 * Maps the various backend/MCP statuses to simplified UI states
 */
export type UISessionStatus = 'idle' | 'starting' | 'working' | 'needsInput' | 'error';

/**
 * Maps backend session status (including MCP values) to UI session status
 * This is the single source of truth for status mapping across the app
 *
 * @param backendStatus - The status from backend or MCP
 * @returns The UI-friendly status for display
 */
export function mapSessionStatus(backendStatus: SessionStatus | string): UISessionStatus {
  switch (backendStatus) {
    // Idle states
    case 'idle':
    case 'disconnected':
    case 'finished': // MCP: task complete
      return 'idle';

    // Starting/connecting
    case 'connecting':
      return 'starting';

    // Active/working states
    case 'active':
    case 'executing':
    case 'thinking':
    case 'working': // MCP: actively processing
      return 'working';

    // Needs input states
    case 'paused':
    case 'needs_input': // MCP: waiting for user input
      return 'needsInput';

    // Error state
    case 'error':
      return 'error';

    // Default fallback
    default:
      return 'idle';
  }
}
