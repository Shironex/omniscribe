import { useMemo } from 'react';
import { Monitor, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { getModeIcon, buildAiModeOptions } from '@/lib/ai-mode-utils';
import type { AiMode, SessionSettings } from '@omniscribe/shared';
import { DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';

export function SessionsSection() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const updatePreference = useWorkspaceStore(state => state.updatePreference);
  const providers = usePluginStore(s => s.providers);
  const statusRenderers = usePluginStore(s => s.statusRenderers);

  const aiModeOptions = useMemo(
    () =>
      buildAiModeOptions(providers, statusRenderers).map(opt => ({
        value: opt.value,
        label: opt.value === 'plain' ? 'Plain Terminal' : opt.label,
        description:
          opt.value === 'plain'
            ? 'Launch sessions as plain terminal without AI'
            : `Launch sessions with ${opt.label} AI assistant`,
        disabled: opt.disabled ?? false,
        disabledReason: opt.disabledReason,
      })),
    [providers, statusRenderers]
  );

  const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
  const skipPermissions = sessionSettings.skipPermissions ?? false;

  const handleModeChange = (mode: AiMode) => {
    updatePreference('session', { ...sessionSettings, defaultMode: mode });
  };

  const handleSkipPermissionsToggle = (next: boolean) => {
    updatePreference('session', { ...sessionSettings, skipPermissions: next });
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Monitor}
        tone="gold"
        title="Sessions"
        subtitle="Configure default behavior for new sessions."
      >
        <SettingsRow stacked>
          <SettingsRowLabel
            title="Default mode"
            description="Used when adding new session slots — change per-slot before launch."
          />
          <div className="space-y-2">
            {aiModeOptions.map(option => {
              const ModeIcon = getModeIcon(option.value, statusRenderers, Monitor);
              const isActive = sessionSettings.defaultMode === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg transition-colors border',
                    option.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
                    isActive
                      ? 'bg-primary/10 border-primary/30'
                      : option.disabled
                        ? 'border-transparent'
                        : 'border-transparent hover:bg-muted/40'
                  )}
                >
                  <input
                    type="radio"
                    name="defaultAiMode"
                    value={option.value}
                    checked={isActive}
                    onChange={() => handleModeChange(option.value)}
                    disabled={option.disabled}
                    className="mt-1 w-4 h-4 text-primary accent-primary"
                  />
                  <ModeIcon className="w-4 h-4 mt-0.5 text-muted-foreground" size={16} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {option.disabled ? option.disabledReason : option.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsToggleRow
          divider
          title="Allow skip-permissions mode"
          description="Launch Claude sessions with --dangerously-skip-permissions flag"
          checked={skipPermissions}
          onCheckedChange={handleSkipPermissionsToggle}
        />

        {skipPermissions && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-status-warning-bg border border-status-warning/20">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <div className="text-xs text-status-warning">
              <strong>Warning:</strong> Skip-permissions mode allows Claude to execute commands,
              edit files, and make changes without asking for confirmation. Only enable this if you
              trust your prompts and understand the risks. This applies to new sessions only —
              existing sessions are not affected.
            </div>
          </div>
        )}
      </SettingsCard>

      <div className="rounded-xl border border-border-glass bg-muted/20 p-4">
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">What does this control?</strong>
          </p>
          <p>
            This setting determines the default AI mode when adding new session slots. You can still
            change the mode for individual slots before launching them.
          </p>
        </div>
      </div>
    </div>
  );
}
