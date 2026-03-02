import { useCallback } from 'react';
import { toast } from 'sonner';
import { extractErrorMessage, EDITOR_OPTIONS } from '@omniscribe/shared';
import { useSessionStore } from '@/stores/useSessionStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { resumeSession } from '@/lib/session';

/**
 * Provides session action callbacks (resume, open-in-editor) that read
 * from stores directly, avoiding the need to thread them through props.
 */
export function useSessionActions(activeProjectPath: string | null) {
  const updateSession = useSessionStore(state => state.updateSession);

  const handleResume = useCallback(
    async (sessionId: string) => {
      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
      if (!session?.claudeSessionId || !session.projectPath) return;
      try {
        const resumed = await resumeSession(
          session.claudeSessionId,
          session.projectPath,
          session.branch
        );
        if (resumed.terminalSessionId !== undefined) {
          updateSession(resumed.id, {
            terminalSessionId: resumed.terminalSessionId,
          });
        }
        toast.success('Session resumed');
      } catch (error) {
        const msg = extractErrorMessage(error, 'Failed to resume');
        toast.error(msg);
      }
    },
    [updateSession]
  );

  const handleOpenInEditor = useCallback(
    async (sessionId: string) => {
      const session = useSessionStore.getState().sessions.find(s => s.id === sessionId);
      const folderPath = session?.worktreePath ?? session?.projectPath ?? activeProjectPath;
      if (!folderPath) {
        toast.error('No project path available');
        return;
      }

      const editorProtocol = useTerminalStore.getState().editorProtocol;
      const editor = EDITOR_OPTIONS.find(e => e.id === editorProtocol);
      if (!editor) {
        toast.error('No editor configured. Set one in Settings → Terminal.');
        return;
      }

      try {
        await window.electronAPI?.app?.openInEditor(editorProtocol, folderPath);
      } catch (error) {
        const msg = extractErrorMessage(error, 'Failed to open in editor');
        toast.error(msg);
      }
    },
    [activeProjectPath]
  );

  return { handleResume, handleOpenInEditor };
}
