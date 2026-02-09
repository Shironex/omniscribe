import { useWorkspaceStore, useSettingsStore } from '@/stores';
import { DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';
import type { AiMode } from '@omniscribe/shared';

/**
 * Derives the effective default AI mode based on Claude CLI availability
 * and workspace preferences. Falls back to 'plain' when CLI is not installed.
 */
export function useDefaultAiMode(): { defaultAiMode: AiMode; claudeAvailable: boolean } {
  const claudeCliStatus = useSettingsStore(state => state.claudeCliStatus);
  const claudeAvailable = claudeCliStatus?.installed ?? false;

  const configuredDefaultAiMode = useWorkspaceStore(
    state => state.preferences.session?.defaultMode ?? DEFAULT_SESSION_SETTINGS.defaultMode
  );

  const defaultAiMode = claudeAvailable ? configuredDefaultAiMode : 'plain';

  return { defaultAiMode, claudeAvailable };
}
