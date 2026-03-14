import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { animationVariants, transitions } from '@/lib/animations';
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
    <motion.div
      className={cn('flex items-center gap-1.5 flex-wrap', className)}
      initial="initial"
      animate="animate"
      transition={{ staggerChildren: 0.05 }}
    >
      {actions.map(action => {
        const Icon = action.icon;
        const variant = action.variant || 'default';

        return (
          <motion.div
            key={action.id}
            variants={animationVariants.scaleIn}
            transition={transitions.spring}
          >
            <motion.button
              type="button"
              onClick={() => onRunAction(action.id)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={transitions.spring}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full',
                'text-xs font-medium',
                'border border-transparent',
                'transition-colors duration-150',
                variantStyles[variant]
              )}
            >
              {Icon && <Icon size={12} />}
              <span>{action.label}</span>
            </motion.button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
