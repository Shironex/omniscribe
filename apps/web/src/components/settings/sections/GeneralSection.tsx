import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AboutCard } from './AboutCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { UpdatesCard } from './UpdatesCard';

export function GeneralSection() {
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
          <Info className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">About</h2>
          <p className="text-sm text-muted-foreground">Application information</p>
        </div>
      </div>

      <AboutCard />
      <DiagnosticsCard />
      <UpdatesCard />
    </div>
  );
}
