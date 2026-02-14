import React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { TerminalSession } from './TerminalHeader';

interface RowPrimaryLayoutProps {
  rows: number[][];
  sessions: TerminalSession[];
  onLayoutChange: () => void;
  renderTerminalCard: (session: TerminalSession) => React.ReactNode;
}

export function RowPrimaryLayout({
  rows,
  sessions,
  onLayoutChange,
  renderTerminalCard,
}: RowPrimaryLayoutProps) {
  return (
    <Group
      orientation="vertical"
      onLayoutChange={onLayoutChange}
      className="h-full w-full min-h-0 min-w-0"
    >
      {rows.map((row, rowIndex) => (
        <React.Fragment key={`row-${rowIndex}`}>
          {rowIndex > 0 && (
            <Separator className="h-1.5 flex items-center justify-center group">
              <div className="w-8 h-0.5 bg-border rounded-full group-hover:bg-primary transition-colors" />
            </Separator>
          )}
          <Panel
            id={`row-${rowIndex}`}
            defaultSize={100 / rows.length}
            minSize={15}
            className="min-h-0 min-w-0 overflow-hidden"
          >
            <Group
              orientation="horizontal"
              onLayoutChange={onLayoutChange}
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
                      defaultSize={100 / row.length}
                      minSize={15}
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
