import React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { TerminalSession } from './TerminalHeader';

interface ColumnPrimaryLayoutProps {
  columns: number[][];
  sessions: TerminalSession[];
  onLayoutChange: () => void;
  renderTerminalCard: (session: TerminalSession) => React.ReactNode;
}

export function ColumnPrimaryLayout({
  columns,
  sessions,
  onLayoutChange,
  renderTerminalCard,
}: ColumnPrimaryLayoutProps) {
  return (
    <Group
      orientation="horizontal"
      onLayoutChange={onLayoutChange}
      className="h-full w-full min-h-0 min-w-0"
    >
      {columns.map((column, columnIndex) => (
        <React.Fragment key={`column-${columnIndex}`}>
          {columnIndex > 0 && (
            <Separator className="w-1.5 flex items-center justify-center group">
              <div className="h-10 w-0.5 bg-border/60 rounded-full group-hover:bg-primary/60 group-hover:h-12 transition-all duration-200" />
            </Separator>
          )}
          <Panel
            id={`column-${columnIndex}`}
            defaultSize={`${100 / columns.length}%`}
            minSize="20%"
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <Group
              orientation="vertical"
              onLayoutChange={onLayoutChange}
              className="h-full w-full min-h-0 min-w-0"
            >
              {column.map((sessionIndex, rowIndex) => {
                const session = sessions[sessionIndex];
                if (!session) return null;
                return (
                  <React.Fragment key={session.id}>
                    {rowIndex > 0 && (
                      <Separator className="h-1.5 flex items-center justify-center group">
                        <div className="w-10 h-0.5 bg-border/60 rounded-full group-hover:bg-primary/60 group-hover:w-12 transition-all duration-200" />
                      </Separator>
                    )}
                    <Panel
                      id={`cell-${columnIndex}-${rowIndex}`}
                      defaultSize={`${100 / column.length}%`}
                      minSize="20%"
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
  );
}
