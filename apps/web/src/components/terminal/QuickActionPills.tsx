import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface QuickAction {
  id: string;
  label: string;
  icon?: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

interface QuickActionPillsProps {
  actions: QuickAction[];
  onRunAction: (actionId: string) => void;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: 'bg-card hover:bg-border text-foreground-secondary hover:text-foreground',
  primary: 'bg-primary/10 hover:bg-primary/20 text-primary',
  success: 'bg-status-success/10 hover:bg-status-success/20 text-status-success',
  warning: 'bg-status-warning/10 hover:bg-status-warning/20 text-status-warning',
  danger: 'bg-status-error/10 hover:bg-status-error/20 text-status-error',
};

export function QuickActionPills({ actions, onRunAction, className }: QuickActionPillsProps) {
  if (actions.length === 0) return null;

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      {actions.map(action => {
        const Icon = action.icon;
        const variant = action.variant || 'default';

        return (
          <button
            key={action.id}
            onClick={() => onRunAction(action.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
              'text-xs font-medium',
              'border border-transparent',
              'transition-all duration-150',
              'hover:scale-105 active:scale-95',
              variantStyles[variant]
            )}
          >
            {Icon && <Icon size={12} />}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}
