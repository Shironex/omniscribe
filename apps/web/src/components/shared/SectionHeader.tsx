import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}

/**
 * Shared section header with gradient icon box used across settings pages.
 * Absorbs the repeated icon box + ring-color inline style pattern.
 */
export function SectionHeader({ icon: Icon, title, description, children }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center',
          'bg-linear-to-br from-primary/20 to-brand-600/10',
          'ring-1'
        )}
        style={
          {
            '--tw-ring-color': 'color-mix(in oklch, var(--primary), transparent 80%)',
          } as React.CSSProperties
        }
      >
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
