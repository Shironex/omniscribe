import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeSwatchCard } from '@/components/shared/theme/ThemeSwatchCard';
import type { ThemeOption } from '@/lib/theme';
import type { Theme } from '@omniscribe/shared';

interface ThemeGridProps {
  themes: readonly ThemeOption[];
  /** Optional editorial label shown above the grid (e.g. "Built-in"). */
  label?: string;
  /** Optional icon prefix for the editorial label. */
  icon?: LucideIcon;
  activeTheme: string;
  /** Receives a curated `Theme` for built-ins or an arbitrary string for plugin themes. */
  onSelect: (theme: Theme | string) => void;
  /** Optional trailing element in the header (count badge, action, etc.). */
  action?: ReactNode;
  className?: string;
}

/**
 * 4-column palette swatch grid. Mirrors screenshot 1 — four cards across,
 * stacked rows underneath, with an editorial mono header above.
 */
export function ThemeGrid({
  themes,
  label,
  icon: Icon,
  activeTheme,
  onSelect,
  action,
  className,
}: ThemeGridProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {label && (
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] font-semibold">
            {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
            {label}
            <span className="tabular-nums text-muted-foreground/60">· {themes.length}</span>
          </span>
          <span className="flex-1 h-px bg-border-glass" />
          {action}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {themes.map(opt => (
          <ThemeSwatchCard
            key={opt.value}
            option={opt}
            isActive={activeTheme === opt.value}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
