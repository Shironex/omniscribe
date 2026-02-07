import { clsx } from 'clsx';
import { useMemo } from 'react';
import { getLayout } from '@/lib/terminal-layout';

interface GridPresetCardProps {
  count: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function GridPresetCard({ count, selected, disabled, onClick }: GridPresetCardProps) {
  const layout = useMemo(() => getLayout(count), [count]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${count} ${count === 1 ? 'session' : 'sessions'}`}
      className={clsx(
        'flex flex-col items-center p-2.5 rounded-lg',
        'border transition-all duration-200',
        'cursor-pointer',
        disabled && 'opacity-40 cursor-not-allowed',
        selected
          ? 'border-[var(--status-success)] shadow-[0_0_8px_rgba(34,197,94,0.25)] bg-[var(--status-success)]/5'
          : 'border-border hover:border-muted-foreground bg-card/30 hover:bg-card/50'
      )}
    >
      {/* Mini grid preview */}
      <div className="flex flex-col gap-1 w-full aspect-[4/3]">
        {layout.rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1 flex-1">
            {row.map(cellIndex => (
              <div
                key={cellIndex}
                className={clsx(
                  'flex-1 rounded-[3px] border',
                  selected
                    ? 'bg-[var(--status-success)]/30 border-[var(--status-success)]/50'
                    : 'bg-muted-foreground/15 border-muted-foreground/20'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </button>
  );
}
