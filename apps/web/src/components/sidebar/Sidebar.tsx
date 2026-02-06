import { useState, useRef, useCallback, useMemo } from 'react';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('Sidebar');
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  GitBranch,
  FileText,
  Layers,
  Zap,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { GitSection } from './GitSection';
import { SessionsSection } from './SessionsSection';
import { QuickActionsSection } from './QuickActionsSection';
import { useSessionStore, useTerminalStore } from '@/stores';
import { writeToTerminal } from '@/lib/terminal';
import { QuickAction } from '@omniscribe/shared';
import { useSidebarResize } from '@/hooks/useSidebarResize';

type SidebarTab = 'config' | 'processes';

interface SidebarProps {
  collapsed: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  className?: string;
}

interface CollapsibleSectionProps {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  icon: Icon,
  title,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2',
          'hover:bg-muted/50 transition-colors',
          isExpanded && 'border-b border-border'
        )}
      >
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wide flex-1 text-left">
          {title}
        </span>
        {isExpanded ? (
          <ChevronDown size={14} className="text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground" />
        )}
      </button>
      {isExpanded && (
        <div className="p-3">
          {children || <p className="text-xs text-muted-foreground">No items configured</p>}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ collapsed, width, onWidthChange, className }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('config');
  const { isResizing, handleMouseDown } = useSidebarResize(onWidthChange);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Get sessions for the Processes tab - use stable selector
  const sessions = useSessionStore(state => state.sessions);
  const activeSessionCount = useMemo(
    () =>
      sessions.filter(
        s => s.status === 'active' || s.status === 'thinking' || s.status === 'executing'
      ).length,
    [sessions]
  );

  // Terminal control store for focus and session management
  const setFocusedSessionId = useTerminalStore(state => state.setFocusedSessionId);
  const requestAddSlot = useTerminalStore(state => state.requestAddSlot);
  const focusedSessionId = useTerminalStore(state => state.focusedSessionId);

  const handleSessionClick = useCallback(
    (sessionId: string) => {
      // Set the focused session in the shared store
      setFocusedSessionId(sessionId);
    },
    [setFocusedSessionId]
  );

  const handleNewSession = useCallback(() => {
    // Request a new pre-launch slot via the shared store
    requestAddSlot();
  }, [requestAddSlot]);

  const handleActionExecute = useCallback(
    (action: QuickAction) => {
      // Find the focused session to send the command to
      const focusedSession = focusedSessionId
        ? sessions.find(s => s.id === focusedSessionId)
        : null;

      // If no focused session, try to use the first active session
      const targetSession =
        focusedSession ?? sessions.find(s => s.status === 'active' || s.status === 'executing');

      if (!targetSession?.terminalSessionId) {
        logger.warn('No active terminal session to execute action');
        return;
      }

      // Build the command based on the action handler and params
      const params = action.params ?? {};
      let command = '';
      if (action.handler === 'shell') {
        // For shell actions, the command is in params
        command = String(params.command ?? params.cmd ?? '');
      } else if (action.handler === 'script') {
        // For script actions, run the script file
        command = String(params.path ?? params.script ?? '');
      } else {
        // For other handlers, try to construct a command
        command = String(params.command ?? params.cmd ?? action.id);
      }

      if (command) {
        // Write the command to the terminal with a newline to execute it
        writeToTerminal(targetSession.terminalSessionId, command + '\n');
      }
    },
    [focusedSessionId, sessions]
  );

  return (
    <div
      ref={sidebarRef}
      className={twMerge(
        clsx(
          'relative bg-muted border-r border-border',
          'flex flex-col overflow-hidden transition-all duration-200',
          collapsed ? 'w-0' : ''
        ),
        className
      )}
      style={{ width: collapsed ? 0 : width }}
    >
      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('config')}
          className={clsx(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'config'
              ? 'text-foreground bg-card'
              : 'text-muted-foreground hover:text-foreground-secondary'
          )}
        >
          Config
        </button>
        <button
          onClick={() => setActiveTab('processes')}
          className={clsx(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'processes'
              ? 'text-foreground bg-card'
              : 'text-muted-foreground hover:text-foreground-secondary'
          )}
        >
          Processes
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'config' ? (
          <>
            {/* Git Repository Section */}
            <CollapsibleSection icon={GitBranch} title="Git Repository">
              <GitSection />
            </CollapsibleSection>

            {/* Project Context Section */}
            <CollapsibleSection icon={FileText} title="Project Context" defaultExpanded={false}>
              <p className="text-xs text-muted-foreground">
                Project context files will be shown here.
              </p>
            </CollapsibleSection>

            {/* Sessions Section */}
            <CollapsibleSection icon={Layers} title="Sessions">
              <SessionsSection
                onSessionClick={handleSessionClick}
                onNewSession={handleNewSession}
              />
            </CollapsibleSection>

            {/* Quick Actions Section */}
            <CollapsibleSection icon={Zap} title="Quick Actions">
              <QuickActionsSection onActionExecute={handleActionExecute} />
            </CollapsibleSection>
          </>
        ) : (
          /* Processes Tab */
          <div className="space-y-3">
            {activeSessionCount > 0 ? (
              <CollapsibleSection icon={Layers} title={`Active Sessions (${activeSessionCount})`}>
                <SessionsSection onSessionClick={handleSessionClick} />
              </CollapsibleSection>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-8">
                No active processes
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'absolute top-0 right-0 w-1 h-full cursor-ew-resize',
          'hover:bg-primary/50 transition-colors',
          isResizing && 'bg-primary'
        )}
      >
        <div className="absolute top-1/2 right-0 -translate-y-1/2 -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity">
          <GripVertical size={12} className="text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
