import { GitBranch, Trash2, FolderOpen, HardDrive, FlaskConical, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';
import { useWorkspaceStore } from '@/stores';
import type { WorktreeMode, WorktreeLocation, WorktreeSettings } from '@omniscribe/shared';
import { DEFAULT_WORKTREE_SETTINGS, USER_DATA_DIR, WORKTREES_DIR } from '@omniscribe/shared';

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
  const preferences = useWorkspaceStore((state) => state.preferences);
  const updatePreference = useWorkspaceStore((state) => state.updatePreference);

  // Get worktree settings with defaults
  const worktreeSettings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;

  const handleModeChange = (mode: WorktreeMode) => {
    updatePreference('worktree', {
      ...worktreeSettings,
      mode,
    });
  };

  const handleLocationChange = (location: WorktreeLocation) => {
    updatePreference('worktree', {
      ...worktreeSettings,
      location,
    });
  };

  const handleAutoCleanupToggle = () => {
    updatePreference('worktree', {
      ...worktreeSettings,
      autoCleanup: !worktreeSettings.autoCleanup,
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
            'ring-1 ring-primary/20',
          )}
        >
          <GitBranch className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">Worktrees</h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <FlaskConical className="w-3 h-3" />
              Experimental
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure Git worktree behavior for sessions
          </p>
        </div>
      </div>

      {/* Worktree Mode */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Worktree Mode</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
          {WORKTREE_MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={clsx(
                'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                worktreeSettings.mode === option.value
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted/50 border border-transparent',
              )}
            >
              <input
                type="radio"
                name="worktreeMode"
                value={option.value}
                checked={worktreeSettings.mode === option.value}
                onChange={() => handleModeChange(option.value)}
                className="mt-1 w-4 h-4 text-primary accent-primary"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">
                  {option.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Worktree Location */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Storage Location</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
          {WORKTREE_LOCATION_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <label
                key={option.value}
                className={clsx(
                  'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
                  worktreeSettings.location === option.value
                    ? 'bg-primary/10 border border-primary/30'
                    : 'hover:bg-muted/50 border border-transparent',
                )}
              >
                <input
                  type="radio"
                  name="worktreeLocation"
                  value={option.value}
                  checked={worktreeSettings.location === option.value}
                  onChange={() => handleLocationChange(option.value)}
                  className="mt-1 w-4 h-4 text-primary accent-primary"
                />
                <Icon className="w-4 h-4 mt-0.5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {option.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Auto-cleanup Setting */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Cleanup</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  Auto-cleanup worktrees
                </div>
                <div className="text-xs text-muted-foreground">
                  Automatically remove worktrees when session ends
                </div>
              </div>
            </div>
            <button
              onClick={handleAutoCleanupToggle}
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors duration-200',
                worktreeSettings.autoCleanup
                  ? 'bg-primary'
                  : 'bg-border',
              )}
              role="switch"
              aria-checked={worktreeSettings.autoCleanup}
            >
              <div
                className={clsx(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
                  worktreeSettings.autoCleanup ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {/* Warning for auto-cleanup */}
          {worktreeSettings.autoCleanup && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-400">
                <strong>Warning:</strong> If the app crashes or terminals close unexpectedly,
                worktrees and any uncommitted changes may be lost.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">What are worktrees?</strong>
          </p>
          <p>
            Git worktrees allow you to have multiple working directories for the same repository.
            This enables running sessions on different branches simultaneously without switching branches.
          </p>
          <p>
            <strong className="text-foreground">Storage locations:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>
              <strong>Project directory:</strong> Creates <code className="bg-muted px-1 py-0.5 rounded">.worktrees/</code> in your project root (recommended)
            </li>
            <li>
              <strong>Central location:</strong> Uses <code className="bg-muted px-1 py-0.5 rounded">~/{USER_DATA_DIR}/{WORKTREES_DIR}/</code> for all projects
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
