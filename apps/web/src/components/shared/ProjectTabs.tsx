import { clsx } from 'clsx';
import { X, Plus } from 'lucide-react';
import { StatusDot } from './StatusLegend';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import type { Tab } from './TopBar';

interface ProjectTabsProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onNewTab: () => void;
  closeTabShortcut: string;
}

export function ProjectTabs({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  closeTabShortcut,
}: ProjectTabsProps) {
  return (
    <div className="flex items-center overflow-x-auto no-scrollbar shrink min-w-0" role="tablist">
      {tabs.map(tab => (
        <div
          key={tab.id}
          role="tab"
          tabIndex={activeTabId === tab.id ? 0 : -1}
          aria-selected={activeTabId === tab.id}
          className={clsx(
            'no-drag group flex items-center gap-2 px-3 h-full min-w-0',
            'cursor-pointer transition-colors border-r border-border',
            activeTabId === tab.id
              ? 'bg-card text-foreground'
              : 'text-foreground-secondary hover:bg-card/50 hover:text-foreground'
          )}
          onClick={() => onSelectTab(tab.id)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectTab(tab.id);
            }
          }}
        >
          {tab.status && <StatusDot status={tab.status} />}
          <span className="text-sm truncate max-w-32">{tab.label}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={e => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="p-0.5 h-auto w-auto opacity-0 group-hover:opacity-100"
                aria-label={`Close ${tab.label}`}
              >
                <X size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Close tab
              <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-white/10 rounded">
                {closeTabShortcut}
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      ))}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="new-tab-button"
            onClick={onNewTab}
            className="no-drag px-3 h-full"
            aria-label="New tab"
          >
            <Plus size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">New tab</TooltipContent>
      </Tooltip>
    </div>
  );
}
