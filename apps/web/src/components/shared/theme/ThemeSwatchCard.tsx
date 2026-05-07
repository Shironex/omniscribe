import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThemeOption } from '@/lib/theme';
import type { Theme } from '@omniscribe/shared';

interface ThemeSwatchCardProps {
  option: ThemeOption;
  isActive: boolean;
  /** Receives a curated `Theme` for built-ins or an arbitrary string for plugin themes. */
  onSelect: (theme: Theme | string) => void;
}

/**
 * Theme swatch rendered as a palette quartet card — four color tiles
 * (background, surface, primary, accent) above a mono label and check.
 *
 * Distinctly different from a single gradient: callers see exactly which
 * four colors define the theme, which surfaces real palette balance the
 * way an icon-only swatch never could.
 */
export function ThemeSwatchCard({ option, isActive, onSelect }: ThemeSwatchCardProps) {
  const { swatch } = option;

  return (
    <button
      type="button"
      data-testid={option.testId}
      onClick={() => onSelect(option.value)}
      aria-pressed={isActive}
      aria-label={option.label}
      className={cn(
        'group relative w-full rounded-xl border bg-card/40 backdrop-blur-sm p-3 text-left',
        'transition-[transform,box-shadow,border-color] duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg hover:border-border',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        isActive ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border-glass'
      )}
    >
      {/* Four-tile palette quartet */}
      <div
        className="grid grid-cols-4 gap-1.5 aspect-[4/1] rounded-md overflow-hidden border border-border-glass/60"
        aria-hidden="true"
      >
        <span style={{ background: swatch.bg }} />
        <span style={{ background: swatch.surface }} />
        <span style={{ background: swatch.primary }} />
        <span style={{ background: swatch.accent }} />
      </div>

      <div className="flex items-center justify-between mt-2.5 px-0.5">
        <span className="font-mono text-[12px] text-foreground tracking-[-0.01em]">
          {option.label}
        </span>
        {isActive && <Check className="size-3.5 text-primary" aria-hidden="true" />}
      </div>
    </button>
  );
}
