import { CodexIcon } from './CodexIcon';

/**
 * Codex status renderer for SessionStatusDisplay.
 *
 * Provides the OpenAI logo icon with green accent color in the session header.
 * Registered as a session status renderer via frontendActivate.
 */
export function CodexStatusRenderer() {
  return <CodexIcon size={14} className="text-[#10A37F]" />;
}
