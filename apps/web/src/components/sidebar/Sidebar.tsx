import { useState, useRef, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  GitBranch,
  FileText,
  Layers,
  Server,
  Zap,
  Palette,
  Moon,
  Sun,
  GripVertical,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { GitSection } from './GitSection';
import { SessionsSection } from './SessionsSection';
import { McpSection } from './McpSection';
import { QuickActionsSection } from './QuickActionsSection';
import { useSessionStore } from '../../stores';
import { QuickAction } from '@omniscribe/shared';

type Theme = 'dark' | 'light';
type SidebarTab = 'config' | 'processes';

interface SidebarProps {
  collapsed: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  theme: Theme;
  onToggleTheme: () => void;
  className?: string;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 320;

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
    <div className="bg-omniscribe-card rounded-lg border border-omniscribe-border overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          'w-full flex items-center gap-2 px-3 py-2',
          'hover:bg-omniscribe-surface/50 transition-colors',
          isExpanded && 'border-b border-omniscribe-border'
        )}
      >
        <Icon size={14} className="text-omniscribe-text-muted" />
        <span className="text-xs font-medium text-omniscribe-text-secondary uppercase tracking-wide flex-1 text-left">
          {title}
        </span>
        {isExpanded ? (
          <ChevronDown size={14} className="text-omniscribe-text-muted" />
        ) : (
          <ChevronRight size={14} className="text-omniscribe-text-muted" />
        )}
      </button>
      {isExpanded && (
        <div className="p-3">
          {children || (
            <p className="text-xs text-omniscribe-text-muted">No items configured</p>
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  collapsed,
  width,
  onWidthChange,
  theme,
  onToggleTheme,
  className,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('config');
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Get sessions for the Processes tab
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionCount = sessions.filter(
    (s) => s.status === 'active' || s.status === 'thinking' || s.status === 'executing'
  ).length;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleSessionClick = (sessionId: string) => {
    // TODO: Implement session focus - emit event or call workspace store
    console.log('[Sidebar] Focus session:', sessionId);
  };

  const handleNewSession = () => {
    // TODO: Implement new session creation
    console.log('[Sidebar] Create new session');
  };

  const handleActionExecute = (action: QuickAction) => {
    // TODO: Implement action execution via socket or IPC
    console.log('[Sidebar] Execute action:', action.id, action.handler, action.params);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      onWidthChange(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, onWidthChange]);

  return (
    <div
      ref={sidebarRef}
      className={twMerge(
        clsx(
          'relative bg-omniscribe-surface border-r border-omniscribe-border',
          'flex flex-col overflow-hidden transition-all duration-200',
          collapsed ? 'w-0' : ''
        ),
        className
      )}
      style={{ width: collapsed ? 0 : width }}
    >
      {/* Tab switcher */}
      <div className="flex border-b border-omniscribe-border">
        <button
          onClick={() => setActiveTab('config')}
          className={clsx(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'config'
              ? 'text-omniscribe-text-primary bg-omniscribe-card'
              : 'text-omniscribe-text-muted hover:text-omniscribe-text-secondary'
          )}
        >
          Config
        </button>
        <button
          onClick={() => setActiveTab('processes')}
          className={clsx(
            'flex-1 px-3 py-2 text-xs font-medium transition-colors',
            activeTab === 'processes'
              ? 'text-omniscribe-text-primary bg-omniscribe-card'
              : 'text-omniscribe-text-muted hover:text-omniscribe-text-secondary'
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
              <p className="text-xs text-omniscribe-text-muted">
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

            {/* MCP Servers Section */}
            <CollapsibleSection icon={Server} title="MCP Servers">
              <McpSection />
            </CollapsibleSection>

            {/* Quick Actions Section */}
            <CollapsibleSection icon={Zap} title="Quick Actions">
              <QuickActionsSection onActionExecute={handleActionExecute} />
            </CollapsibleSection>

            {/* Appearance Section */}
            <CollapsibleSection icon={Palette} title="Appearance" defaultExpanded={false}>
              <button
                onClick={onToggleTheme}
                className={clsx(
                  'flex items-center gap-2 w-full px-2 py-1.5 rounded',
                  'text-xs text-omniscribe-text-secondary',
                  'bg-omniscribe-surface hover:bg-omniscribe-border',
                  'transition-colors'
                )}
              >
                {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
                <span>{theme === 'dark' ? 'Dark' : 'Light'} Theme</span>
              </button>
            </CollapsibleSection>
          </>
        ) : (
          /* Processes Tab */
          <div className="space-y-3">
            {activeSessionCount > 0 ? (
              <CollapsibleSection icon={Layers} title={`Active Sessions (${activeSessionCount})`}>
                <SessionsSection
                  onSessionClick={handleSessionClick}
                />
              </CollapsibleSection>
            ) : (
              <div className="text-xs text-omniscribe-text-muted text-center py-8">
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
          'hover:bg-omniscribe-accent-primary/50 transition-colors',
          isResizing && 'bg-omniscribe-accent-primary'
        )}
      >
        <div className="absolute top-1/2 right-0 -translate-y-1/2 -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity">
          <GripVertical size={12} className="text-omniscribe-text-muted" />
        </div>
      </div>
    </div>
  );
}
