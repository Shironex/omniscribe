import React, { useCallback, useMemo } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSwappingStrategy } from '@dnd-kit/sortable';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { SortableTerminalWrapper } from './SortableTerminalWrapper';
import { TerminalCard } from './TerminalCard';
import type { QuickActionItem } from './TerminalCard';
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
  quickActions?: QuickActionItem[];
  focusedSessionId: string | null;
  onFocusSession: (sessionId: string) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  onUpdateSlot: (
    slotId: string,
    updates: Partial<Pick<PreLaunchSlot, 'aiMode' | 'branch'>>
  ) => void;
  onLaunch: (slotId: string) => void;
  onKill: (sessionId: string) => void;
  onSessionClose?: (sessionId: string, exitCode: number) => void;
  onQuickAction?: (sessionId: string, actionId: string) => void;
  onOpenLaunchModal?: () => void;
  onResume?: (sessionId: string) => void;
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
  quickActions = [],
  focusedSessionId,
  onFocusSession,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
  onLaunch,
  onKill,
  onSessionClose,
  onQuickAction,
  onResume,
  onOpenLaunchModal,
  onReorderSessions,
  className,
}: TerminalGridProps) {
  const sessionCount = sessions.length;
  const layout = useMemo(() => getLayout(sessionCount), [sessionCount]);
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

  // Stable callback refs passed to all TerminalCards (avoids inline arrows per-session)
  const handleFocusSession = useCallback(
    (sessionId: string) => onFocusSession(sessionId),
    [onFocusSession]
  );
  const handleKill = useCallback((sessionId: string) => onKill(sessionId), [onKill]);
  const handleSessionClose = useCallback(
    (sessionId: string, exitCode: number) => onSessionClose?.(sessionId, exitCode),
    [onSessionClose]
  );
  const handleQuickAction = useCallback(
    (sessionId: string, actionId: string) => onQuickAction?.(sessionId, actionId),
    [onQuickAction]
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
      <TerminalCard
        session={session}
        quickActions={quickActions}
        isFocused={focusedSessionId === session.id}
        onFocus={handleFocusSession}
        onKill={handleKill}
        onSessionClose={onSessionClose ? handleSessionClose : undefined}
        onQuickAction={onQuickAction ? handleQuickAction : undefined}
        onResume={onResume}
      />
    </SortableTerminalWrapper>
  );

  return (
    <div
      data-testid="terminal-grid"
      className={twMerge(clsx('h-full w-full flex flex-col', className))}
    >
      {/* Main grid area for active sessions */}
      <div className="flex-1 min-h-0 p-2">
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
                <Group
                  orientation="vertical"
                  onLayoutChange={handlePanelResize}
                  className="h-full w-full min-h-0 min-w-0"
                >
                  {layout.rows.map((row, rowIndex) => (
                    <React.Fragment key={`row-${rowIndex}`}>
                      {rowIndex > 0 && (
                        <Separator className="h-1.5 flex items-center justify-center group">
                          <div className="w-8 h-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                        </Separator>
                      )}
                      <Panel
                        id={`row-${rowIndex}`}
                        defaultSize={`${100 / layout.rows.length}%`}
                        minSize="15%"
                        className="min-h-0 min-w-0 overflow-hidden"
                      >
                        <Group
                          orientation="horizontal"
                          onLayoutChange={handlePanelResize}
                          className="h-full w-full min-h-0 min-w-0"
                        >
                          {row.map((sessionIndex, colIndex) => {
                            const session = sessions[sessionIndex];
                            if (!session) return null;
                            return (
                              <React.Fragment key={session.id}>
                                {colIndex > 0 && (
                                  <Separator className="w-1.5 flex items-center justify-center group">
                                    <div className="h-8 w-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                                  </Separator>
                                )}
                                <Panel
                                  id={`cell-${rowIndex}-${colIndex}`}
                                  defaultSize={`${100 / row.length}%`}
                                  minSize="15%"
                                  className="min-h-0 min-w-0 overflow-hidden"
                                >
                                  {renderTerminalCard(session)}
                                </Panel>
                              </React.Fragment>
                            );
                          })}
                        </Group>
                      </Panel>
                    </React.Fragment>
                  ))}
                </Group>
              ) : (
                <Group
                  orientation="horizontal"
                  onLayoutChange={handlePanelResize}
                  className="h-full w-full min-h-0 min-w-0"
                >
                  {columns.map((column, columnIndex) => (
                    <React.Fragment key={`column-${columnIndex}`}>
                      {columnIndex > 0 && (
                        <Separator className="w-1.5 flex items-center justify-center group">
                          <div className="h-8 w-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                        </Separator>
                      )}
                      <Panel
                        id={`column-${columnIndex}`}
                        defaultSize={`${100 / columns.length}%`}
                        minSize="15%"
                        className="min-h-0 min-w-0 overflow-hidden"
                      >
                        <Group
                          orientation="vertical"
                          onLayoutChange={handlePanelResize}
                          className="h-full w-full min-h-0 min-w-0"
                        >
                          {column.map((sessionIndex, rowIndex) => {
                            const session = sessions[sessionIndex];
                            if (!session) return null;
                            return (
                              <React.Fragment key={session.id}>
                                {rowIndex > 0 && (
                                  <Separator className="h-1.5 flex items-center justify-center group">
                                    <div className="w-8 h-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                                  </Separator>
                                )}
                                <Panel
                                  id={`cell-${columnIndex}-${rowIndex}`}
                                  defaultSize={`${100 / column.length}%`}
                                  minSize="15%"
                                  className="min-h-0 min-w-0 overflow-hidden"
                                >
                                  {renderTerminalCard(session)}
                                </Panel>
                              </React.Fragment>
                            );
                          })}
                        </Group>
                      </Panel>
                    </React.Fragment>
                  ))}
                </Group>
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
