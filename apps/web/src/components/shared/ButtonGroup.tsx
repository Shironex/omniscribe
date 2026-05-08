import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonGroupOption<T extends string = string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface ButtonGroupProps<T extends string = string> {
  /** Accessible label for the radiogroup. */
  ariaLabel: string;
  options: ReadonlyArray<ButtonGroupOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** Tailwind grid-cols utility, e.g. `grid-cols-3`. Defaults to a flex row. */
  layout?: 'flex' | 'grid-2' | 'grid-3' | 'grid-4';
}

const LAYOUT_CLASS: Record<NonNullable<ButtonGroupProps['layout']>, string> = {
  flex: 'flex flex-wrap gap-1.5',
  'grid-2': 'grid grid-cols-2 gap-1.5',
  'grid-3': 'grid grid-cols-3 gap-1.5',
  'grid-4': 'grid grid-cols-2 gap-1.5 sm:grid-cols-4',
};

/**
 * Segmented radio-group control. Mirrors shiroani's `DOCK_EDGES` pattern
 * so cursor-style, terminal theme, worktree mode, etc. share a single
 * accessible primitive instead of each rolling its own.
 */
export function ButtonGroup<T extends string = string>({
  ariaLabel,
  options,
  value,
  onChange,
  className,
  layout = 'flex',
}: ButtonGroupProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn(LAYOUT_CLASS[layout], className)}>
      {options.map(opt => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-lg border px-3 py-[7px] text-[12px] font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              isActive
                ? 'border-primary/35 bg-primary/15 text-primary font-semibold'
                : 'border-border-glass bg-background/30 text-muted-foreground hover:bg-accent/40 hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
