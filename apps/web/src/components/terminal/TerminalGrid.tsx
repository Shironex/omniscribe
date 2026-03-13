import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSwappingStrategy } from '@dnd-kit/sortable';
import { SortableTerminalWrapper } from './SortableTerminalWrapper';
import { TerminalCard } from './TerminalCard';
import { TerminalHeader } from './TerminalHeader';
import type { TerminalSession } from './TerminalHeader';
import { PreLaunchSection } from './PreLaunchSection';
import type { PreLaunchSlot } from './PreLaunchBar';
import { IdleLandingView } from '@/components/shared/IdleLandingView';
import { Branch } from '@/components/shared/BranchSelector';
import type { WorktreeMode } from '@omniscribe/shared';
import { buildColumns, getLayout } from '@/lib/terminal-layout';
import { useTerminalGridDnd } from '@/hooks/useTerminalGridDnd';
import { useTerminalPanelResize } from '@/hooks/useTerminalPanelResize';
import { RowPrimaryLayout } from './RowPrimaryLayout';
import { ColumnPrimaryLayout } from './ColumnPrimaryLayout';

const NOOP = () => {};

interface TerminalGridProps {
  sessions: TerminalSession[];
  preLaunchSlots: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  branches: Branch[];
  /** Whether Claude CLI is available (controls Claude mode option) */
  claudeAvailable?: boolean;
  /** Worktree mode — hides branch selector when 'never' */
  worktreeMode?: WorktreeMode;
  /** Whether this grid's project tab is currently active/visible */
  isActive?: boolean;
  focusedSessionId: string | null;
  onFocusSession: (sessionId: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
  onLaunch: (slotId: string) => void;
  onOpenLaunchModal?: () => void;
  onReorderSessions?: (activeId: string, overId: string) => void;
  className?: string;
}

export function TerminalGrid({
  sessions,
  preLaunchSlots,
  launchingSlotIds,
  branches,
  claudeAvailable,
  worktreeMode,
  isActive = true,
  focusedSessionId,
  onFocusSession,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
  onOpenLaunchModal,
  onReorderSessions,
  className,
}: TerminalGridProps) {
  const sessionCount = sessions.length;
  const [containerWidth, setContainerWidth] = useState<number | undefined>();
  const gridRef = useRef<HTMLDivElement | null>(null);

  // ResizeObserver in useEffect for proper cleanup (callback ref cleanup is not
  // supported in React 18 — only React 19+ supports return values from ref callbacks)
  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    setContainerWidth(node.clientWidth);
    const ro = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  const layout = useMemo(
    () => getLayout(sessionCount, containerWidth),
    [sessionCount, containerWidth]
  );
  const columns = useMemo(
    () => buildColumns(layout.rows, layout.columns),
    [layout.rows, layout.columns]
  );
  const useRowPrimaryLayout = sessionCount === 4;

  // All hooks must be called before any early return (Rules of Hooks)
  const sessionIds = useMemo(() => {
    const orderedIndexes = useRowPrimaryLayout ? layout.rows.flat() : columns.flat();
    return orderedIndexes
      .map(sessionIndex => sessions[sessionIndex]?.id)
      .filter((sessionId): sessionId is string => Boolean(sessionId));
  }, [columns, layout.rows, sessions, useRowPrimaryLayout]);

  const { sensors, activeId, handleDragStart, handleDragEnd, handleDragCancel, dispatchRefitAll } =
    useTerminalGridDnd(onReorderSessions);
  const activeSession = activeId ? sessions.find(s => s.id === activeId) : null;
  const { handlePanelResize } = useTerminalPanelResize(dispatchRefitAll);

  // Stable callback ref passed to all TerminalCards
  const handleFocusSession = useCallback(
    (sessionId: string) => onFocusSession(sessionId),
    [onFocusSession]
  );

  // Empty state
  if (sessionCount === 0 && preLaunchSlots.length === 0) {
    return (
      <IdleLandingView
        onAddSession={onAddSlot}
        onOpenLaunchModal={onOpenLaunchModal}
        className={className}
      />
    );
  }

  const renderTerminalCard = (session: TerminalSession) => (
    <SortableTerminalWrapper id={session.id} sessionCount={sessionCount}>
      {dragHandleProps => (
        <TerminalCard
          session={session}
          isActive={isActive}
          isFocused={focusedSessionId === session.id}
          onFocus={handleFocusSession}
          dragHandleProps={dragHandleProps}
        />
      )}
    </SortableTerminalWrapper>
  );

  return (
    <div
      ref={gridRef}
      data-testid="terminal-grid"
      className={cn('h-full w-full flex flex-col', className)}
    >
      {/* Main grid area for active sessions */}
      <div className="flex-1 min-h-0 p-2.5 terminal-grid-bg">
        {sessionCount > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={sessionIds} strategy={rectSwappingStrategy}>
              {useRowPrimaryLayout ? (
                <RowPrimaryLayout
                  rows={layout.rows}
                  sessions={sessions}
                  onLayoutChange={handlePanelResize}
                  renderTerminalCard={renderTerminalCard}
                />
              ) : (
                <ColumnPrimaryLayout
                  columns={columns}
                  sessions={sessions}
                  onLayoutChange={handlePanelResize}
                  renderTerminalCard={renderTerminalCard}
                />
              )}
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
              {activeSession ? (
                <div className="opacity-80 shadow-lg rounded-lg border border-primary/30 bg-muted">
                  <TerminalHeader session={activeSession} onClose={NOOP} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* Empty state when no sessions but have pre-launch slots */
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Configure and launch sessions below</p>
          </div>
        )}
      </div>

      {/* Bottom section for pre-launch bars and add button */}
      <PreLaunchSection
        preLaunchSlots={preLaunchSlots}
        launchingSlotIds={launchingSlotIds}
        branches={branches}
        claudeAvailable={claudeAvailable}
        worktreeMode={worktreeMode}
        onRemoveSlot={onRemoveSlot}
        onUpdateSlot={onUpdateSlot}
        onLaunch={onLaunch}
      />
    </div>
  );
}

// Re-export types for convenience
export type { TerminalSession } from './TerminalHeader';
export type { PreLaunchSlot } from './PreLaunchBar';
