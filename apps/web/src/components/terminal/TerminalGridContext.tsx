import { createContext, useContext } from 'react';
import type { QuickActionItem } from './terminal-types';

/**
 * Context providing session action callbacks and quick actions to
 * deeply nested terminal components, eliminating prop drilling through
 * PersistentProjectGrid → TerminalGrid → TerminalCard → TerminalHeader.
 */
interface TerminalGridContextValue {
  onKill: (sessionId: string) => void;
  onSessionClose: (sessionId: string, exitCode: number) => void;
  onQuickAction?: (sessionId: string, actionId: string) => void;
  onResume?: (sessionId: string) => void;
  onOpenInEditor?: (sessionId: string) => void;
  quickActions: QuickActionItem[];
}

const TerminalGridContext = createContext<TerminalGridContextValue | null>(null);

export const TerminalGridProvider = TerminalGridContext.Provider;

export function useTerminalGridContext(): TerminalGridContextValue {
  const ctx = useContext(TerminalGridContext);
  if (!ctx) {
    throw new Error('useTerminalGridContext must be used within a TerminalGridProvider');
  }
  return ctx;
}
