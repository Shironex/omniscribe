import { useMemo } from 'react';
import { Puzzle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';
import { usePluginStore, type ProviderInfo } from '@/stores/usePluginStore';

interface PluginCardProps {
  provider: ProviderInfo;
  onToggle: (aiMode: string, enabled: boolean) => void;
  isToggling?: boolean;
}

/**
 * Individual plugin card with icon, name, description, and enable/disable toggle.
 * Follows VS Code extensions-style card layout.
 */
export function PluginCard({ provider, onToggle, isToggling }: PluginCardProps) {
  // Prefer a brand icon component registered by the provider plugin
  // (e.g. ClaudeIcon, CodexIcon registered via registerUsagePanel).
  // This matches the icon used in each provider's own settings/usage UI
  // and gives the marketplace card a recognizable brand mark instead of
  // the generic Puzzle fallback.
  const usagePanels = usePluginStore(s => s.usagePanels);
  const BrandIcon = useMemo(() => {
    for (const reg of usagePanels.values()) {
      if (reg.aiMode === provider.aiMode && reg.icon) return reg.icon;
    }
    return null;
  }, [usagePanels, provider.aiMode]);

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card/50 p-4 transition-all hover:border-border',
        'flex items-start gap-4'
      )}
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        {BrandIcon ? (
          <BrandIcon className="w-5 h-5" />
        ) : provider.icon ? (
          <img src={provider.icon} alt={provider.displayName} className="w-5 h-5" />
        ) : (
          <Puzzle className="w-5 h-5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {provider.displayName}
          </span>
          {provider.enabled && provider.activated && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-status-success/10 text-status-success border border-status-success/20">
              Active
            </span>
          )}
          {provider.enabled && !provider.activated && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-status-info/10 text-status-info border border-status-info/20">
              Enabled
            </span>
          )}
          {!provider.enabled && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
              Disabled
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{provider.description}</p>
      </div>

      {/* Toggle */}
      <div className="shrink-0 pt-0.5">
        <Switch
          checked={provider.enabled}
          disabled={isToggling}
          onCheckedChange={checked => onToggle(provider.aiMode, checked)}
          aria-label={`${provider.enabled ? 'Disable' : 'Enable'} ${provider.displayName}`}
        />
      </div>
    </div>
  );
}
