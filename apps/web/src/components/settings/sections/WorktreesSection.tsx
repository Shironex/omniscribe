import {
  GitBranch,
  Trash2,
  FolderOpen,
  HardDrive,
  FlaskConical,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { WorktreeMode, WorktreeLocation, WorktreeSettings } from '@omniscribe/shared';
import { DEFAULT_WORKTREE_SETTINGS, USER_DATA_DIR, WORKTREES_DIR } from '@omniscribe/shared';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { StatusPill } from '@/components/shared/StatusPill';
import { WorktreesPreview } from '@/components/settings/previews/WorktreesPreview';

const WORKTREE_MODE_OPTIONS: {
  value: WorktreeMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'branch',
    label: 'When selecting different branch',
    description: 'Creates a worktree only when you select a non-current branch',
  },
  {
    value: 'always',
    label: 'Always create isolated worktree',
    description: 'Always creates a new worktree with random suffix for full isolation',
  },
  {
    value: 'never',
    label: 'Never use worktrees',
    description: 'Always work in the main project directory',
  },
];

const WORKTREE_LOCATION_OPTIONS: {
  value: WorktreeLocation;
  label: string;
  description: string;
  icon: typeof FolderOpen;
}[] = [
  {
    value: 'project',
    label: 'Project directory',
    description: 'Store in .worktrees/ folder inside your project',
    icon: FolderOpen,
  },
  {
    value: 'central',
    label: 'Central location',
    description: 'Store in ~/.omniscribe/worktrees/ (hidden)',
    icon: HardDrive,
  },
];

export function WorktreesSection() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const updatePreference = useWorkspaceStore(state => state.updatePreference);

  const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;

  const handleModeChange = (mode: WorktreeMode) => {
    updatePreference('worktree', { ...worktreeSettings, mode });
  };

  const handleLocationChange = (location: WorktreeLocation) => {
    updatePreference('worktree', { ...worktreeSettings, location });
  };

  const handleAutoCleanupToggle = (next: boolean) => {
    updatePreference('worktree', { ...worktreeSettings, autoCleanup: next });
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Eye}
        tone="blue"
        title="Preview"
        subtitle="Branch tree showing how sessions fork off main."
      >
        <WorktreesPreview />
      </SettingsCard>

      <SettingsCard
        icon={GitBranch}
        tone="green"
        title="Worktrees"
        subtitle="Configure Git worktree behavior for sessions."
        headerAccessory={
          <StatusPill tone="warning" icon={FlaskConical}>
            Experimental
          </StatusPill>
        }
      >
        <SettingsRow stacked>
          <SettingsRowLabel
            title="Worktree mode"
            description="When should sessions launch into a separate worktree?"
          />
          <div className="space-y-2">
            {WORKTREE_MODE_OPTIONS.map(option => {
              const isActive = worktreeSettings.mode === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border',
                    isActive
                      ? 'bg-primary/10 border-primary/30'
                      : 'border-transparent hover:bg-muted/40'
                  )}
                >
                  <input
                    type="radio"
                    name="worktreeMode"
                    value={option.value}
                    checked={isActive}
                    onChange={() => handleModeChange(option.value)}
                    className="mt-1 w-4 h-4 text-primary accent-primary"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsRow stacked divider>
          <SettingsRowLabel
            title="Storage location"
            description="Where worktrees are created on disk."
          />
          <div className="space-y-2">
            {WORKTREE_LOCATION_OPTIONS.map(option => {
              const Icon = option.icon;
              const isActive = worktreeSettings.location === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border',
                    isActive
                      ? 'bg-primary/10 border-primary/30'
                      : 'border-transparent hover:bg-muted/40'
                  )}
                >
                  <input
                    type="radio"
                    name="worktreeLocation"
                    value={option.value}
                    checked={isActive}
                    onChange={() => handleLocationChange(option.value)}
                    className="mt-1 w-4 h-4 text-primary accent-primary"
                  />
                  <Icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </SettingsRow>

        <SettingsToggleRow
          divider
          title={
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
              Auto-cleanup worktrees
            </span>
          }
          description="Automatically remove worktrees when session ends"
          checked={worktreeSettings.autoCleanup}
          onCheckedChange={handleAutoCleanupToggle}
        />

        {worktreeSettings.autoCleanup && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-status-warning-bg border border-status-warning/20">
            <AlertTriangle className="w-4 h-4 text-status-warning mt-0.5 shrink-0" />
            <div className="text-xs text-status-warning">
              <strong>Warning:</strong> If the app crashes or terminals close unexpectedly,
              worktrees and any uncommitted changes may be lost.
            </div>
          </div>
        )}
      </SettingsCard>

      <div className="rounded-xl border border-border-glass bg-muted/20 p-4">
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">What are worktrees?</strong>
          </p>
          <p>
            Git worktrees allow you to have multiple working directories for the same repository.
            This enables running sessions on different branches simultaneously without switching
            branches.
          </p>
          <p>
            <strong className="text-foreground">Storage locations:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Project directory:</strong> Creates{' '}
              <code className="bg-muted px-1 py-0.5 rounded">.worktrees/</code> in your project root
              (recommended)
            </li>
            <li>
              <strong>Central location:</strong> Uses{' '}
              <code className="bg-muted px-1 py-0.5 rounded">
                ~/{USER_DATA_DIR}/{WORKTREES_DIR}/
              </code>{' '}
              for all projects
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
