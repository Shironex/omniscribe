import { useMemo, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { mapToTerminalSessions } from '@/lib/session-mappers';
import { TerminalGrid } from './TerminalGrid';
import { TerminalGridProvider } from './TerminalGridContext';
import type { PreLaunchSlot } from './PreLaunchBar';
import type { Branch } from '@/components/shared/BranchSelector';
import type { QuickActionItem } from './TerminalCard';
import type { WorktreeMode } from '@omniscribe/shared';

const EMPTY_PRELAUNCH_SLOTS: PreLaunchSlot[] = [];
const EMPTY_BRANCHES: Branch[] = [];
const EMPTY_QUICK_ACTIONS: QuickActionItem[] = [];

interface PersistentProjectGridProps {
  projectPath: string;
  isActive: boolean;
  // Active-only props (ignored when inactive)
  preLaunchSlots?: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  branches?: Branch[];
  worktreeMode?: WorktreeMode;
  quickActions?: QuickActionItem[];
  onAddSlot: () => void;
  onOpenLaunchModal?: () => void;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
  onLaunch: (slotId: string) => void;
  // Session action callbacks (provided via context to children)
  onKill: (sessionId: string) => void;
  onSessionClose: (sessionId: string, exitCode: number) => void;
  onQuickAction?: (sessionId: string, actionId: string) => void;
  onResume?: (sessionId: string) => void;
  onOpenInEditor?: (sessionId: string) => void;
}

/**
 * Wrapper around TerminalGrid that persists across tab switches.
 * Each project gets its own instance, deriving sessions from the store.
 * Inactive grids are hidden via CSS but remain mounted to preserve xterm instances.
 *
 * Provides session action callbacks via TerminalGridContext so that
 * TerminalCard/TerminalHeader can consume them without prop drilling.
 */
export function PersistentProjectGrid({
  projectPath,
  isActive,
  preLaunchSlots,
  launchingSlotIds,
  branches,
  worktreeMode,
  quickActions,
  onAddSlot,
  onOpenLaunchModal,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
  onKill,
  onSessionClose,
  onQuickAction,
  onResume,
  onOpenInEditor,
}: PersistentProjectGridProps) {
  // Use shallow-compared selectors so this component only re-renders when
  // sessions for THIS project actually change, not on every global session/title update.
  const projectSessions = useSessionStore(
    useShallow(state => state.sessions.filter(s => s.projectPath === projectPath))
  );
  const customTitles = useSessionStore(
    useShallow(state => {
      const titles: Record<string, string> = {};
      for (const s of state.sessions) {
        if (s.projectPath === projectPath && state.customTitles[s.id]) {
          titles[s.id] = state.customTitles[s.id];
        }
      }
      return titles;
    })
  );
  const sessionOrder = useTerminalStore(state => state.sessionOrder);
  const setSessionOrder = useTerminalStore(state => state.setSessionOrder);

  // Per-project focused session state
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  const handleFocusSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
  }, []);

  // Map sessions to TerminalSession format using shared utility
  const terminalSessions = useMemo(() => {
    return mapToTerminalSessions(projectSessions, customTitles);
  }, [projectSessions, customTitles]);

  // Order sessions using global session order
  const orderedSessions = useMemo(() => {
    if (sessionOrder.length === 0) return terminalSessions;
    const orderMap = new Map(sessionOrder.map((id, idx) => [id, idx]));
    return [...terminalSessions]
      .sort((a, b) => {
        const aIndex = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      })
      .map((session, idx) => ({ ...session, sessionNumber: idx + 1 }));
  }, [terminalSessions, sessionOrder]);

  // Reorder by swapping IDs in the global session order
  const handleReorderSessions = useCallback(
    (activeId: string, overId: string) => {
      const currentOrder = [...sessionOrder];
      const oldIndex = currentOrder.indexOf(activeId);
      const newIndex = currentOrder.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const temp = currentOrder[oldIndex];
      currentOrder[oldIndex] = currentOrder[newIndex];
      currentOrder[newIndex] = temp;
      setSessionOrder(currentOrder);
    },
    [sessionOrder, setSessionOrder]
  );

  // Use active-specific or empty defaults for props
  const effectivePreLaunchSlots = isActive
    ? (preLaunchSlots ?? EMPTY_PRELAUNCH_SLOTS)
    : EMPTY_PRELAUNCH_SLOTS;
  const effectiveBranches = isActive ? (branches ?? EMPTY_BRANCHES) : EMPTY_BRANCHES;
  const effectiveQuickActions = isActive
    ? (quickActions ?? EMPTY_QUICK_ACTIONS)
    : EMPTY_QUICK_ACTIONS;

  // Don't render if no sessions and no pre-launch slots
  if (terminalSessions.length === 0 && effectivePreLaunchSlots.length === 0) return null;

  // Context value for session action callbacks
  const contextValue = useMemo(
    () => ({
      onKill,
      onSessionClose,
      onQuickAction,
      onResume,
      onOpenInEditor,
      quickActions: effectiveQuickActions,
    }),
    [onKill, onSessionClose, onQuickAction, onResume, onOpenInEditor, effectiveQuickActions]
  );

  return (
    <div className={cn('absolute inset-0', isActive ? 'z-10' : 'invisible pointer-events-none')}>
      <TerminalGridProvider value={contextValue}>
        <TerminalGrid
          sessions={orderedSessions}
          isActive={isActive}
          preLaunchSlots={effectivePreLaunchSlots}
          launchingSlotIds={isActive ? launchingSlotIds : undefined}
          branches={effectiveBranches}
          worktreeMode={isActive ? worktreeMode : undefined}
          focusedSessionId={focusedSessionId}
          onFocusSession={handleFocusSession}
          onAddSlot={onAddSlot}
          onOpenLaunchModal={onOpenLaunchModal}
          onRemoveSlot={onRemoveSlot}
          onUpdateSlot={onUpdateSlot}
          onLaunch={onLaunch}
          onReorderSessions={handleReorderSessions}
        />
      </TerminalGridProvider>
    </div>
  );
}
