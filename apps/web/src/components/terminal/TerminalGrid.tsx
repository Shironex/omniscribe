import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSwappingStrategy } from '@dnd-kit/sortable';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { TerminalView } from './TerminalView';
import { TerminalErrorBoundary } from './TerminalErrorBoundary';
import { SortableTerminalWrapper } from './SortableTerminalWrapper';
import type { TerminalDragHandleProps } from './SortableTerminalWrapper';
import { TerminalHeader } from './TerminalHeader';
import type { TerminalSession } from './TerminalHeader';
import { PreLaunchBar } from './PreLaunchBar';
import type { PreLaunchSlot } from './PreLaunchBar';
import { IdleLandingView } from '@/components/shared/IdleLandingView';
import { Branch } from '@/components/shared/BranchSelector';

interface QuickActionItem {
  id: string;
  label: string;
  icon?: string;
  category?: string;
}

interface TerminalGridProps {
  sessions: TerminalSession[];
  preLaunchSlots: PreLaunchSlot[];
  launchingSlotIds?: Set<string>;
  branches: Branch[];
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
  onReorderSessions?: (activeId: string, overId: string) => void;
  className?: string;
}

function buildColumns(rows: number[][], columnsCount: number): number[][] {
  const columns: number[][] = Array.from({ length: columnsCount }, () => []);
  for (const row of rows) {
    row.forEach((sessionIndex, columnIndex) => {
      if (columns[columnIndex]) {
        columns[columnIndex].push(sessionIndex);
      }
    });
  }
  return columns.filter(column => column.length > 0);
}

// Calculate layout for a given number of sessions
function getLayout(count: number): { rows: number[][]; columns: number } {
  switch (count) {
    case 0:
      return { rows: [], columns: 0 };
    case 1:
      return { rows: [[0]], columns: 1 };
    case 2:
      return { rows: [[0, 1]], columns: 2 };
    case 3:
      return { rows: [[0, 1, 2]], columns: 3 };
    case 4:
      return {
        rows: [
          [0, 1],
          [2, 3],
        ],
        columns: 2,
      };
    case 5:
      return {
        rows: [
          [0, 1, 2],
          [3, 4],
        ],
        columns: 3,
      };
    case 6:
      return {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
        ],
        columns: 3,
      };
    case 7:
      return { rows: [[0, 1, 2], [3, 4, 5], [6]], columns: 3 };
    case 8:
      return {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7],
        ],
        columns: 3,
      };
    case 9:
      return {
        rows: [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7, 8],
        ],
        columns: 3,
      };
    case 10:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9],
        ],
        columns: 4,
      };
    case 11:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10],
        ],
        columns: 4,
      };
    case 12:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
        ],
        columns: 4,
      };
    default:
      return {
        rows: [
          [0, 1, 2, 3],
          [4, 5, 6, 7],
          [8, 9, 10, 11],
        ],
        columns: 4,
      };
  }
}

function TerminalCard({
  session,
  quickActions,
  isFocused,
  onFocus,
  onKill,
  onSessionClose,
  onQuickAction,
  dragHandleProps,
}: {
  session: TerminalSession;
  quickActions: QuickActionItem[];
  isFocused: boolean;
  onFocus: () => void;
  onKill: () => void;
  onSessionClose?: (exitCode: number) => void;
  onQuickAction?: (actionId: string) => void;
  dragHandleProps?: TerminalDragHandleProps;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col h-full min-h-0 min-w-0 rounded-lg overflow-hidden',
        'border border-border',
        'bg-card',
        isFocused && 'ring-2 ring-primary',
        'transition-all duration-150'
      )}
      onClick={onFocus}
    >
      <TerminalHeader
        session={session}
        quickActions={quickActions}
        onClose={onKill}
        onQuickAction={onQuickAction ? actionId => onQuickAction(actionId) : undefined}
        dragHandleProps={dragHandleProps}
      />
      <div className="flex-1 min-h-0">
        {session.terminalSessionId !== undefined ? (
          <TerminalErrorBoundary sessionId={session.terminalSessionId}>
            <TerminalView
              sessionId={session.terminalSessionId}
              isFocused={isFocused}
              onClose={exitCode => onSessionClose?.(exitCode)}
            />
          </TerminalErrorBoundary>
        ) : (
          <div className="flex items-center justify-center h-full bg-muted text-muted-foreground text-sm">
            Connecting to terminal...
          </div>
        )}
      </div>
    </div>
  );
}

export function TerminalGrid({
  sessions,
  preLaunchSlots,
  launchingSlotIds,
  branches,
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
  const trailingRefitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatchRefitAll = useCallback((delays: number[] = [0, 80, 180]) => {
    for (const delay of delays) {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      }, delay);
    }
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReorderSessions?.(String(active.id), String(over.id));
      // Refit all terminals after drag and transition settle.
      dispatchRefitAll();
    },
    [dispatchRefitAll, onReorderSessions]
  );

  const handlePanelResize = useCallback(() => {
    window.dispatchEvent(new CustomEvent('terminal-refit-all'));
    if (trailingRefitTimeoutRef.current) {
      clearTimeout(trailingRefitTimeoutRef.current);
    }
    trailingRefitTimeoutRef.current = setTimeout(() => {
      dispatchRefitAll([0, 120]);
      trailingRefitTimeoutRef.current = null;
    }, 70);
  }, [dispatchRefitAll]);

  useEffect(() => {
    return () => {
      if (trailingRefitTimeoutRef.current) {
        clearTimeout(trailingRefitTimeoutRef.current);
        trailingRefitTimeoutRef.current = null;
      }
    };
  }, []);

  // Empty state
  if (sessionCount === 0 && preLaunchSlots.length === 0) {
    return <IdleLandingView onAddSession={onAddSlot} className={className} />;
  }

  // Max terminals: 12
  const canAddMore = sessionCount + preLaunchSlots.length < 12;

  const sessionIds = useMemo(() => {
    const orderedIndexes = useRowPrimaryLayout ? layout.rows.flat() : columns.flat();
    return orderedIndexes
      .map(sessionIndex => sessions[sessionIndex]?.id)
      .filter((sessionId): sessionId is string => Boolean(sessionId));
  }, [columns, layout.rows, sessions, useRowPrimaryLayout]);

  return (
    <div className={twMerge(clsx('h-full w-full flex flex-col', className))}>
      {/* Main grid area for active sessions */}
      <div className="flex-1 min-h-0 p-2">
        {sessionCount > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sessionIds} strategy={rectSwappingStrategy}>
              {useRowPrimaryLayout ? (
                <PanelGroup
                  direction="vertical"
                  onLayout={handlePanelResize}
                  className="h-full w-full min-h-0 min-w-0"
                >
                  {layout.rows.map((row, rowIndex) => (
                    <React.Fragment key={`row-${rowIndex}`}>
                      {rowIndex > 0 && (
                        <PanelResizeHandle className="h-1.5 flex items-center justify-center group">
                          <div className="w-8 h-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                        </PanelResizeHandle>
                      )}
                      <Panel
                        id={`row-${rowIndex}`}
                        order={rowIndex}
                        defaultSize={100 / layout.rows.length}
                        minSize={15}
                        className="min-h-0 min-w-0 overflow-hidden"
                      >
                        <PanelGroup
                          direction="horizontal"
                          onLayout={handlePanelResize}
                          className="h-full w-full min-h-0 min-w-0"
                        >
                          {row.map((sessionIndex, colIndex) => {
                            const session = sessions[sessionIndex];
                            if (!session) return null;
                            return (
                              <React.Fragment key={session.id}>
                                {colIndex > 0 && (
                                  <PanelResizeHandle className="w-1.5 flex items-center justify-center group">
                                    <div className="h-8 w-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                                  </PanelResizeHandle>
                                )}
                                <Panel
                                  id={`cell-${rowIndex}-${colIndex}`}
                                  order={colIndex}
                                  defaultSize={100 / row.length}
                                  minSize={15}
                                  className="min-h-0 min-w-0 overflow-hidden"
                                >
                                  <SortableTerminalWrapper id={session.id}>
                                    <TerminalCard
                                      session={session}
                                      quickActions={quickActions}
                                      isFocused={focusedSessionId === session.id}
                                      onFocus={() => onFocusSession(session.id)}
                                      onKill={() => onKill(session.id)}
                                      onSessionClose={
                                        onSessionClose
                                          ? exitCode => onSessionClose(session.id, exitCode)
                                          : undefined
                                      }
                                      onQuickAction={
                                        onQuickAction
                                          ? actionId => onQuickAction(session.id, actionId)
                                          : undefined
                                      }
                                    />
                                  </SortableTerminalWrapper>
                                </Panel>
                              </React.Fragment>
                            );
                          })}
                        </PanelGroup>
                      </Panel>
                    </React.Fragment>
                  ))}
                </PanelGroup>
              ) : (
                <PanelGroup
                  direction="horizontal"
                  onLayout={handlePanelResize}
                  className="h-full w-full min-h-0 min-w-0"
                >
                  {columns.map((column, columnIndex) => (
                    <React.Fragment key={`column-${columnIndex}`}>
                      {columnIndex > 0 && (
                        <PanelResizeHandle className="w-1.5 flex items-center justify-center group">
                          <div className="h-8 w-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                        </PanelResizeHandle>
                      )}
                      <Panel
                        id={`column-${columnIndex}`}
                        order={columnIndex}
                        defaultSize={100 / columns.length}
                        minSize={15}
                        className="min-h-0 min-w-0 overflow-hidden"
                      >
                        <PanelGroup
                          direction="vertical"
                          onLayout={handlePanelResize}
                          className="h-full w-full min-h-0 min-w-0"
                        >
                          {column.map((sessionIndex, rowIndex) => {
                            const session = sessions[sessionIndex];
                            if (!session) return null;
                            return (
                              <React.Fragment key={session.id}>
                                {rowIndex > 0 && (
                                  <PanelResizeHandle className="h-1.5 flex items-center justify-center group">
                                    <div className="w-8 h-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
                                  </PanelResizeHandle>
                                )}
                                <Panel
                                  id={`cell-${columnIndex}-${rowIndex}`}
                                  order={rowIndex}
                                  defaultSize={100 / column.length}
                                  minSize={15}
                                  className="min-h-0 min-w-0 overflow-hidden"
                                >
                                  <SortableTerminalWrapper id={session.id}>
                                    <TerminalCard
                                      session={session}
                                      quickActions={quickActions}
                                      isFocused={focusedSessionId === session.id}
                                      onFocus={() => onFocusSession(session.id)}
                                      onKill={() => onKill(session.id)}
                                      onSessionClose={
                                        onSessionClose
                                          ? exitCode => onSessionClose(session.id, exitCode)
                                          : undefined
                                      }
                                      onQuickAction={
                                        onQuickAction
                                          ? actionId => onQuickAction(session.id, actionId)
                                          : undefined
                                      }
                                    />
                                  </SortableTerminalWrapper>
                                </Panel>
                              </React.Fragment>
                            );
                          })}
                        </PanelGroup>
                      </Panel>
                    </React.Fragment>
                  ))}
                </PanelGroup>
              )}
            </SortableContext>
          </DndContext>
        ) : (
          /* Empty state when no sessions but have pre-launch slots */
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Configure and launch sessions below</p>
          </div>
        )}
      </div>

      {/* Bottom section for pre-launch bars and add button */}
      <div className="flex-shrink-0 p-2 pt-0 space-y-2">
        {preLaunchSlots.map((slot, index) => (
          <PreLaunchBar
            key={slot.id}
            slot={slot}
            slotIndex={index + 1}
            branches={branches}
            isLaunching={launchingSlotIds?.has(slot.id)}
            onUpdate={onUpdateSlot}
            onLaunch={onLaunch}
            onRemove={onRemoveSlot}
          />
        ))}

        {canAddMore && (
          <button
            onClick={onAddSlot}
            className={clsx(
              'w-full flex items-center justify-center gap-2 py-2 rounded-lg',
              'border border-dashed border-border',
              'bg-card/30 hover:bg-card/50',
              'text-muted-foreground hover:text-foreground-secondary',
              'transition-all duration-150',
              'hover:border-primary/50',
              'group'
            )}
            aria-label="Add session"
            title="Press N to add session"
          >
            <Plus size={16} className="group-hover:text-primary transition-colors" />
            <span className="text-sm">Add Session</span>
            <kbd className="px-1.5 py-0.5 text-xs bg-muted border border-border rounded">N</kbd>
          </button>
        )}
      </div>
    </div>
  );
}

// Re-export types for convenience
export type { TerminalSession, AIMode } from './TerminalHeader';
export type { PreLaunchSlot, AIMode as PreLaunchAIMode } from './PreLaunchBar';
