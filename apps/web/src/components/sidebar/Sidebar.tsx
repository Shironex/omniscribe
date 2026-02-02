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
} from 'lucide-react';

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

function SidebarCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-omniscribe-card rounded-lg border border-omniscribe-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-omniscribe-border">
        <Icon size={14} className="text-omniscribe-text-muted" />
        <span className="text-xs font-medium text-omniscribe-text-secondary uppercase tracking-wide">
          {title}
        </span>
      </div>
      <div className="p-3">
        {children || (
          <p className="text-xs text-omniscribe-text-muted">No items configured</p>
        )}
      </div>
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

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
            <SidebarCard icon={GitBranch} title="Git Repository">
              <div className="text-xs text-omniscribe-text-secondary font-mono">
                main
              </div>
            </SidebarCard>

            <SidebarCard icon={FileText} title="Project Context" />

            <SidebarCard icon={Layers} title="Sessions" />

            <SidebarCard icon={Server} title="MCP Servers" />

            <SidebarCard icon={Zap} title="Quick Actions" />

            <SidebarCard icon={Palette} title="Appearance">
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
            </SidebarCard>
          </>
        ) : (
          <div className="text-xs text-omniscribe-text-muted text-center py-8">
            No active processes
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
