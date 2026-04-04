import React from 'react';
import { StatusDot, type SessionStatus } from '@/components/shared/StatusLegend';
import { cn } from '@/lib/utils';

interface SidebarSessionItemProps {
  name: string;
  status: SessionStatus;
  collapsed: boolean;
}

export const SidebarSessionItem = React.memo(function SidebarSessionItem({
  name,
  status,
  collapsed,
}: SidebarSessionItemProps) {
  if (collapsed) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1 ml-6 mr-1 rounded-md',
        'text-foreground-secondary hover:text-foreground hover:bg-muted-foreground/10',
        'transition-colors duration-100 cursor-default'
      )}
    >
      <StatusDot status={status} className="w-1.5 h-1.5 shrink-0" />
      <span className="text-xs truncate">{name}</span>
    </div>
  );
});
