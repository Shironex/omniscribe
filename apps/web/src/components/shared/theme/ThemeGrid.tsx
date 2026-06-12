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
 * Palette swatch grid. Mirrors screenshot 1 — cards across with stacked rows
 * underneath and an editorial mono header above.
 *
 * Columns respond to the width of the surrounding settings container (not the
 * viewport) via container queries, so the grid degrades to two columns — with
 * intact labels — when Settings is docked into a narrow workspace tab. It
 * scales back up to four columns only when the content column is genuinely
 * wide. The `@container/settings` context is declared on each settings section
 * root (see `SettingsCard` consumers).
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

      <div className="grid grid-cols-2 @md/settings:grid-cols-3 @2xl/settings:grid-cols-4 gap-3">
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
