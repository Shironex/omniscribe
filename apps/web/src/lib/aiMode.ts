import type { AiMode } from '@omniscribe/shared';
import type { AIMode } from '@/components/terminal/PreLaunchBar';

/**
 * Maps UI AIMode to backend AiMode
 * Both are now the same: 'claude' | 'plain'
 */
export function mapAiModeToBackend(uiMode: AIMode): AiMode {
  return uiMode;
}

/**
 * Maps backend AiMode to UI AIMode
 * Both are now the same: 'claude' | 'plain'
 */
export function mapAiModeToUI(backendMode: AiMode): AIMode {
  return backendMode;
}
