import { Monitor } from 'lucide-react';
import { clsx } from 'clsx';
import { useWorkspaceStore } from '@/stores';
import type { AiMode, SessionSettings } from '@omniscribe/shared';
import { DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';

const AI_MODE_OPTIONS: {
  value: AiMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'claude',
    label: 'Claude Code',
    description: 'Launch sessions with Claude Code AI assistant',
  },
  {
    value: 'plain',
    label: 'Plain Terminal',
    description: 'Launch sessions as plain terminal without AI',
  },
];

export function SessionsSection() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const updatePreference = useWorkspaceStore(state => state.updatePreference);

  const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;

  const handleModeChange = (mode: AiMode) => {
    updatePreference('session', {
      ...sessionSettings,
      defaultMode: mode,
    });
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-brand-600/10',
            'ring-1'
          )}
          style={
            {
              '--tw-ring-color': 'color-mix(in oklch, var(--primary), transparent 80%)',
            } as React.CSSProperties
          }
        >
          <Monitor className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Sessions</h2>
          <p className="text-sm text-muted-foreground">
            Configure default behavior for new sessions
          </p>
        </div>
      </div>

      {/* Default AI Mode */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Default Mode</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
          {AI_MODE_OPTIONS.map(option => (
            <label
              key={option.value}
              className={clsx(
                'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                sessionSettings.defaultMode === option.value
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted/50 border border-transparent'
              )}
            >
              <input
                type="radio"
                name="defaultAiMode"
                value={option.value}
                checked={sessionSettings.defaultMode === option.value}
                onChange={() => handleModeChange(option.value)}
                className="mt-1 w-4 h-4 text-primary accent-primary"
              />
              {option.value === 'claude' ? (
                <ClaudeIcon className="w-4 h-4 mt-0.5 text-muted-foreground" />
              ) : (
                <Monitor className="w-4 h-4 mt-0.5 text-muted-foreground" />
              )}
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">{option.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
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
