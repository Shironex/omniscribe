import { useState, useCallback, useRef, useEffect } from 'react';
import { Puzzle } from 'lucide-react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { usePluginStore } from '@/stores/usePluginStore';
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
  const toggleTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (toggleTimeoutRef.current) clearTimeout(toggleTimeoutRef.current);
    };
  }, []);

  const handleToggle = useCallback(
    (aiMode: string, enabled: boolean) => {
      setTogglingAiMode(aiMode);
      setProviderEnabled(aiMode, enabled);

      // Clear toggling state after a short delay
      // The optimistic update in usePluginStore handles the immediate UI change
      if (toggleTimeoutRef.current) clearTimeout(toggleTimeoutRef.current);
      toggleTimeoutRef.current = setTimeout(() => {
        setTogglingAiMode(null);
      }, 500);
    },
    [setProviderEnabled]
  );

  return (
    <div className="space-y-6">
      <SectionHeader icon={Puzzle} title="Extensions" description="Manage AI provider plugins" />

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
