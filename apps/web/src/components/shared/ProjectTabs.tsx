import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { X, Plus, Minus, Square, XIcon } from 'lucide-react';
import { StatusDot, SessionStatus } from './StatusLegend';

export interface Tab {
  id: string;
  label: string;
  status?: SessionStatus;
}

interface ProjectTabsProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  className?: string;
}

export function ProjectTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  className,
}: ProjectTabsProps) {
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  return (
    <div
      className={twMerge(
        clsx(
          'h-10 bg-muted border-b border-border',
          'flex items-center select-none drag',
          className
        )
      )}
    >
      {/* Tab list */}
      <div className="flex-1 flex items-center overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              'no-drag group flex items-center gap-2 px-3 h-full min-w-0',
              'cursor-pointer transition-colors border-r border-border',
              activeTabId === tab.id
                ? 'bg-card text-foreground'
                : 'text-foreground-secondary hover:bg-card/50 hover:text-foreground'
            )}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.status && <StatusDot status={tab.status} />}
            <span className="text-sm truncate max-w-32">{tab.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
              className={clsx(
                'p-0.5 rounded opacity-0 group-hover:opacity-100',
                'hover:bg-border transition-all',
                'text-muted-foreground hover:text-foreground'
              )}
              aria-label={`Close ${tab.label}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {/* New tab button */}
        <button
          onClick={onNewTab}
          className={clsx(
            'no-drag flex items-center justify-center px-3 h-full',
            'text-muted-foreground hover:text-foreground',
            'hover:bg-card/50 transition-colors'
          )}
          aria-label="New tab"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Window controls (Electron only) */}
      {isElectron && (
        <div className="no-drag flex items-center gap-1 px-2">
          <button
            onClick={() => window.electronAPI?.window.minimize()}
            className={clsx(
              'w-7 h-7 flex items-center justify-center rounded',
              'hover:bg-card transition-colors',
              'text-muted-foreground hover:text-foreground'
            )}
            aria-label="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => window.electronAPI?.window.maximize()}
            className={clsx(
              'w-7 h-7 flex items-center justify-center rounded',
              'hover:bg-card transition-colors',
              'text-muted-foreground hover:text-foreground'
            )}
            aria-label="Maximize"
          >
            <Square size={12} />
          </button>
          <button
            onClick={() => window.electronAPI?.window.close()}
            className={clsx(
              'w-7 h-7 flex items-center justify-center rounded',
              'hover:bg-red-500/20 transition-colors',
              'text-muted-foreground hover:text-red-500'
            )}
            aria-label="Close"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
