import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
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
  default: 'bg-omniscribe-card hover:bg-omniscribe-border text-omniscribe-text-secondary hover:text-omniscribe-text-primary',
  primary: 'bg-omniscribe-accent-primary/10 hover:bg-omniscribe-accent-primary/20 text-omniscribe-accent-primary',
  success: 'bg-green-500/10 hover:bg-green-500/20 text-green-400',
  warning: 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400',
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-400',
};

export function QuickActionPills({
  actions,
  onRunAction,
  className,
}: QuickActionPillsProps) {
  if (actions.length === 0) return null;

  return (
    <div
      className={twMerge(
        clsx('flex items-center gap-1.5 flex-wrap', className)
      )}
    >
      {actions.map((action) => {
        const Icon = action.icon;
        const variant = action.variant || 'default';

        return (
          <button
            key={action.id}
            onClick={() => onRunAction(action.id)}
            className={clsx(
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
