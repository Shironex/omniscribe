import type { AiMode } from '@omniscribe/shared';
import type { AIMode } from '../components/terminal/TerminalHeader';

/**
 * Maps UI AIMode to backend AiMode
 */
export function mapAiModeToBackend(uiMode: AIMode): AiMode {
  switch (uiMode) {
    case 'claude':
      return 'claude';
    case 'gemini':
      return 'gemini';
    case 'codex':
      return 'openai'; // Map codex to openai
    case 'plain':
      return 'local'; // Map plain to local
    default:
      return 'claude';
  }
}

/**
 * Maps backend AiMode to UI AIMode
 */
export function mapAiModeToUI(backendMode: AiMode): AIMode {
  switch (backendMode) {
    case 'claude':
      return 'claude';
    case 'gemini':
      return 'gemini';
    case 'openai':
      return 'codex'; // Map openai to codex in UI
    case 'local':
    case 'custom':
      return 'plain'; // Map local/custom to plain
    default:
      return 'plain';
  }
}
