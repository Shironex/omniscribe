import React, { useCallback, useMemo } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusDot, type SessionStatus } from '@/components/shared/StatusLegend';
import { SidebarSessionList } from './SidebarSessionList';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useSessionStore } from '@/stores/useSessionStore';
import { useAppUIStore } from '@/stores/useAppUIStore';
import { cn } from '@/lib/utils';
import { mapSessionStatus } from '@omniscribe/shared';

interface SidebarProjectItemProps {
  id: string;
  label: string;
  projectPath: string;
  status?: SessionStatus;
  isActive: boolean;
  collapsed: boolean;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

export const SidebarProjectItem = React.memo(function SidebarProjectItem({
  id,
  label,
  projectPath,
  status,
  isActive,
  collapsed,
  onSelect,
  onClose,
}: SidebarProjectItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const expandedProjects = useAppUIStore(state => state.expandedProjects);
  const toggleProjectExpanded = useAppUIStore(state => state.toggleProjectExpanded);
  const isExpanded = expandedProjects.includes(projectPath);

  const sessions = useSessionStore(state => state.sessions);
  const projectSessions = useMemo(() => {
    const filtered = sessions.filter(s => s.projectPath === projectPath);
    return filtered.map((s, i) => ({
      id: s.id,
      name: s.name || `Session ${i + 1}`,
      status: mapSessionStatus(s.status) as SessionStatus,
    }));
  }, [sessions, projectPath]);

  const sessionCount = projectSessions.length;

  const handleClick = useCallback(() => {
    onSelect(id);
  }, [id, onSelect]);

  const handleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleProjectExpanded(projectPath);
    },
    [projectPath, toggleProjectExpanded]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(id);
    },
    [id, onClose]
  );

  const initial = label.charAt(0).toUpperCase();

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            role="tab"
            aria-selected={isActive}
            onClick={handleClick}
            className={cn(
              'no-drag flex items-center justify-center w-8 h-8 mx-auto rounded-lg cursor-pointer',
              'transition-colors duration-100 relative',
              isActive
                ? 'bg-primary/15 text-primary'
                : 'text-foreground-secondary hover:bg-muted-foreground/10 hover:text-foreground'
            )}
          >
            <span className="text-xs font-semibold">{initial}</span>
            {status && (
              <StatusDot
                status={status}
                className="absolute -top-0.5 -right-0.5 w-2 h-2 ring-1 ring-background"
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {label}
          {sessionCount > 0 && (
            <span className="ml-1.5 text-muted-foreground">({sessionCount})</span>
          )}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <div
        role="tab"
        aria-selected={isActive}
        onClick={handleClick}
        className={cn(
          'no-drag group flex items-center gap-2 px-2 py-1.5 mx-1 rounded-lg cursor-pointer',
          'transition-colors duration-100 relative',
          isActive
            ? 'bg-primary/10 text-foreground'
            : 'text-foreground-secondary hover:bg-muted-foreground/10 hover:text-foreground'
        )}
      >
        {/* Active indicator bar */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-primary" />
        )}

        {/* Expand chevron */}
        {sessionCount > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExpand}
            className="p-0 w-4 h-4 shrink-0 hover:bg-transparent"
            aria-label={isExpanded ? 'Collapse sessions' : 'Expand sessions'}
          >
            <ChevronRight
              size={14}
              className={cn('transition-transform duration-150', isExpanded && 'rotate-90')}
            />
          </Button>
        ) : (
          <div className="w-4 h-4 shrink-0" />
        )}

        {status && <StatusDot status={status} className="shrink-0" />}

        <span className="text-sm truncate flex-1">{label}</span>

        {sessionCount > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {sessionCount}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="p-0 h-auto w-auto opacity-0 group-hover:opacity-100 shrink-0 transition-opacity duration-100"
          aria-label={`Close ${label}`}
        >
          <X size={14} />
        </Button>
      </div>

      <SidebarSessionList
        sessions={projectSessions}
        isExpanded={isExpanded}
        collapsed={collapsed}
      />
    </div>
  );
});
