import { useState, useCallback } from 'react';
import { Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePluginStore } from '@/stores';
import { PluginCard } from './PluginCard';

/**
 * Marketplace section for browsing and toggling AI provider plugins.
 * Renders in the settings modal as a card grid (VS Code extensions style).
 */
export function PluginMarketplace() {
  const providers = usePluginStore(s => s.providers);
  const setProviderEnabled = usePluginStore(s => s.setProviderEnabled);

  // Track which provider is currently being toggled (prevents double-click)
  const [togglingAiMode, setTogglingAiMode] = useState<string | null>(null);

  const handleToggle = useCallback(
    (aiMode: string, enabled: boolean) => {
      setTogglingAiMode(aiMode);
      setProviderEnabled(aiMode, enabled);

      // Clear toggling state after a short delay
      // The optimistic update in usePluginStore handles the immediate UI change
      setTimeout(() => {
        setTogglingAiMode(null);
      }, 500);
    },
    [setProviderEnabled]
  );

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

      {/* Plugin Cards */}
      {providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Puzzle className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No plugins available</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Plugins will appear here when registered
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {providers.map(provider => (
            <PluginCard
              key={provider.aiMode}
              provider={provider}
              onToggle={handleToggle}
              isToggling={togglingAiMode === provider.aiMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
