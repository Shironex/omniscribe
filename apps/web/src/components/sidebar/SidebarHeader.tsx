import { PanelLeftClose, PanelLeft, Plus } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IS_ELECTRON, IS_MAC } from '@/lib/platform';

interface SidebarHeaderProps {
  collapsed: boolean;
  onToggle: () => void;
  onNewProject: () => void;
}

export function SidebarHeader({ collapsed, onToggle, onNewProject }: SidebarHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center shrink-0 drag',
        IS_ELECTRON && IS_MAC ? 'pt-8 pb-2 px-3' : 'py-2 px-3',
        collapsed ? 'flex-col gap-2' : 'justify-between'
      )}
    >
      {!collapsed && (
        <span className="no-drag text-sm font-semibold text-foreground tracking-tight truncate">
          Omniscribe
        </span>
      )}

      <div className={cn('no-drag flex items-center', collapsed ? 'flex-col gap-1' : 'gap-0.5')}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="w-7 h-7 text-muted-foreground hover:text-foreground"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            <kbd className="ml-1.5 px-1 py-0.5 text-[10px] bg-foreground/10 rounded">
              {IS_MAC ? '⌘ B' : 'Ctrl+B'}
            </kbd>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onNewProject}
              className="w-7 h-7 text-muted-foreground hover:text-foreground"
              aria-label="Open project"
            >
              <Plus size={16} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={collapsed ? 'right' : 'bottom'}>Open project</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
