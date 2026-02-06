import { useCallback, useMemo } from 'react';
import { createLogger } from '@omniscribe/shared';
import { useQuickActionStore } from '@/stores';
import { writeToTerminal } from '@/lib/terminal';
import type { TerminalSession } from '@/components/terminal/TerminalGrid';

const logger = createLogger('QuickActionExecution');

interface UseQuickActionExecutionReturn {
  quickActionsForTerminal: { id: string; label: string; icon?: string; category?: string }[];
  handleQuickAction: (sessionId: string, actionId: string) => void;
}

/**
 * Hook that manages quick action filtering and execution.
 */
export function useQuickActionExecution(
  terminalSessions: TerminalSession[]
): UseQuickActionExecutionReturn {
  const allQuickActions = useQuickActionStore(state => state.actions);
  const quickActions = useMemo(
    () => allQuickActions.filter(a => a.enabled !== false),
    [allQuickActions]
  );

  const quickActionsForTerminal = useMemo(
    () => quickActions.map(a => ({ id: a.id, label: a.title, icon: a.icon, category: a.category })),
    [quickActions]
  );

  const handleQuickAction = useCallback(
    (sessionId: string, actionId: string) => {
      const action = quickActions.find(a => a.id === actionId);
      if (!action) return;

      const session = terminalSessions.find(s => s.id === sessionId);
      if (!session?.terminalSessionId) {
        logger.warn('No terminal session for quick action');
        return;
      }

      logger.debug('Executing quick action', actionId, 'on session', sessionId);

      const params = action.params ?? {};
      let command = '';
      if (action.handler === 'terminal:execute' || action.handler === 'shell') {
        command = String(params.command ?? params.cmd ?? '');
      } else if (action.handler === 'script') {
        command = String(params.path ?? params.script ?? '');
      } else {
        command = String(params.command ?? params.cmd ?? action.id);
      }

      if (command) {
        writeToTerminal(session.terminalSessionId, command + '\n');
      }
    },
    [quickActions, terminalSessions]
  );

  return { quickActionsForTerminal, handleQuickAction };
}
