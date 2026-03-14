import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { SessionSettings, QuickActionMode } from '@omniscribe/shared';
import { DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';

const EXECUTION_MODE_OPTIONS: {
  value: QuickActionMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'paste-only',
    label: 'Paste Only',
    description: 'Paste the command text into the terminal for review before running',
  },
  {
    value: 'execute',
    label: 'Paste & Execute',
    description: 'Paste and immediately execute the command in the terminal',
  },
];

export function QuickActionsSection() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const updatePreference = useWorkspaceStore(state => state.updatePreference);

  const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
  const executionMode = sessionSettings.quickActionMode ?? 'paste-only';

  const handleModeChange = (mode: QuickActionMode) => {
    updatePreference('session', {
      ...sessionSettings,
      quickActionMode: mode,
    });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Zap}
        title="Quick Actions"
        description="Configure how quick actions are executed in terminals"
      />

      {/* Execution Mode */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Execution Mode</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
          {EXECUTION_MODE_OPTIONS.map(option => (
            <label
              key={option.value}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                executionMode === option.value
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted/50 border border-transparent'
              )}
            >
              <input
                type="radio"
                name="quickActionMode"
                value={option.value}
                checked={executionMode === option.value}
                onChange={() => handleModeChange(option.value)}
                className="mt-1 w-4 h-4 text-primary accent-primary"
              />
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
            This setting applies to all quick actions globally. In &quot;Paste Only&quot; mode,
            commands are pasted into the terminal without pressing Enter, giving you a chance to
            review before executing.
          </p>
        </div>
      </div>
    </div>
  );
}
