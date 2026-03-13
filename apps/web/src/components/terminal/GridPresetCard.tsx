import { cn } from '@/lib/utils';
import { useMemo } from 'react';
import { getLayout } from '@/lib/terminal-layout';
import { Button } from '@/components/ui/button';

interface GridPresetCardProps {
  count: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function GridPresetCard({ count, selected, disabled, onClick }: GridPresetCardProps) {
  const layout = useMemo(() => getLayout(count), [count]);

  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      title={`${count} ${count === 1 ? 'session' : 'sessions'}`}
      aria-label={`${count} ${count === 1 ? 'session' : 'sessions'}`}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-center p-2.5 h-auto',
        'transition-all duration-200',
        selected
          ? 'border-primary shadow-[0_0_8px_var(--primary)] bg-primary/5'
          : 'border-border bg-card/30 hover:bg-card/50 hover:border-primary/50'
      )}
    >
      {/* Mini grid preview */}
      <div className="flex flex-col gap-1 w-full aspect-4/3" aria-hidden="true">
        {layout.rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-1 flex-1">
            {row.map(cellIndex => (
              <div
                key={cellIndex}
                className={cn(
                  'flex-1 rounded-[3px] border',
                  selected
                    ? 'bg-primary/30 border-primary/50'
                    : 'bg-muted-foreground/15 border-muted-foreground/20'
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </Button>
  );
}
