import { ClaudeIcon } from './ClaudeIcon';

/**
 * Claude status renderer for SessionStatusDisplay.
 *
 * Provides the ClaudeIcon as the provider icon in the session header.
 * Registered as a session status renderer via frontendActivate.
 */
export function ClaudeStatusRenderer() {
  return <ClaudeIcon size={14} className="text-orange-400" />;
}
