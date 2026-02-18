import { Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Marketplace section for browsing and toggling plugins.
 * Placeholder -- will be fully implemented in Task 2.
 */
export function PluginMarketplace() {
  return (
    <div className="space-y-6">
      {/* Section Header */}
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
          <Puzzle className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Extensions</h2>
          <p className="text-sm text-muted-foreground">Manage AI provider plugins</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">No plugins available</p>
    </div>
  );
}
