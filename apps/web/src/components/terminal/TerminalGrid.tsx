import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSwappingStrategy } from '@dnd-kit/sortable';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { SortableTerminalWrapper } from './SortableTerminalWrapper';
import { TerminalCard } from './TerminalCard';
import type { QuickActionItem } from './TerminalCard';
import type { TerminalSession } from './TerminalHeader';
import { PreLaunchSection } from './PreLaunchSection';
import type { PreLaunchSlot } from './PreLaunchBar';
import { IdleLandingView } from '@/components/shared/IdleLandingView';
import { Branch } from '@/components/shared/BranchSelector';
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
  onReorderSessions?: (activeId: string, overId: string) => void;
  className?: string;
}

export function TerminalGrid({
  sessions,
  preLaunchSlots,
  launchingSlotIds,
  branches,
  claudeAvailable,
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

  const { sensors, handleDragEnd, dispatchRefitAll } = useTerminalGridDnd(onReorderSessions);
  const { handlePanelResize } = useTerminalPanelResize(dispatchRefitAll);

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

  // Max terminals: 12
  const canAddMore = sessionCount + preLaunchSlots.length < 12;

  const renderTerminalCard = (session: TerminalSession) => (
    <SortableTerminalWrapper id={session.id} sessionCount={sessionCount}>
      <TerminalCard
        session={session}
        quickActions={quickActions}
        isFocused={focusedSessionId === session.id}
        onFocus={() => onFocusSession(session.id)}
        onKill={() => onKill(session.id)}
        onSessionClose={
          onSessionClose ? exitCode => onSessionClose(session.id, exitCode) : undefined
        }
        onQuickAction={onQuickAction ? actionId => onQuickAction(session.id, actionId) : undefined}
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
                                  {renderTerminalCard(session)}
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
                                  {renderTerminalCard(session)}
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
      <PreLaunchSection
        preLaunchSlots={preLaunchSlots}
        launchingSlotIds={launchingSlotIds}
        branches={branches}
        claudeAvailable={claudeAvailable}
        canAddMore={canAddMore}
        onAddSlot={onAddSlot}
        onOpenLaunchModal={onOpenLaunchModal ?? NOOP}
        onRemoveSlot={onRemoveSlot}
        onUpdateSlot={onUpdateSlot}
        onLaunch={onLaunch}
      />
    </div>
  );
}

// Re-export types for convenience
export type { TerminalSession, AIMode } from './TerminalHeader';
export type { PreLaunchSlot, AIMode as PreLaunchAIMode } from './PreLaunchBar';
