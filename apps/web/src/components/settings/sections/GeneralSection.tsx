import { Settings, FolderOpen, SidebarIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useWorkspaceStore } from '../../../stores';

export function GeneralSection() {
  const preferences = useWorkspaceStore((state) => state.preferences);
  const updatePreference = useWorkspaceStore((state) => state.updatePreference);

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
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">General</h2>
          <p className="text-sm text-muted-foreground">
            General application settings
          </p>
        </div>
      </div>

      {/* Sidebar Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Sidebar</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          {/* Sidebar Default State */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SidebarIcon className="w-4 h-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium text-foreground">
                  Default Sidebar State
                </div>
                <div className="text-xs text-muted-foreground">
                  Sidebar visibility on startup
                </div>
              </div>
            </div>
            <button
              onClick={() => updatePreference('sidebarOpen', !preferences.sidebarOpen)}
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors duration-200',
                preferences.sidebarOpen
                  ? 'bg-primary'
                  : 'bg-border',
              )}
            >
              <div
                className={clsx(
                  'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
                  preferences.sidebarOpen ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>

          {/* Sidebar Width */}
          <div className="pt-2 border-t border-border/30">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-foreground">
                Sidebar Width
              </div>
              <div className="text-xs text-muted-foreground">
                {preferences.sidebarWidth}px
              </div>
            </div>
            <input
              type="range"
              min="180"
              max="320"
              value={preferences.sidebarWidth}
              onChange={(e) =>
                updatePreference('sidebarWidth', parseInt(e.target.value, 10))
              }
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>180px</span>
              <span>320px</span>
            </div>
          </div>
        </div>
      </div>

      {/* Workspace Settings */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">Workspace</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">
                Project Settings
              </div>
              <div className="text-xs text-muted-foreground">
                Configure per-project settings by opening a project and accessing its settings
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">About</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4">
          <div className="text-center space-y-2">
            <div className="text-lg font-bold text-gradient">Omniscribe</div>
            <div className="text-xs text-muted-foreground">
              AI-powered development workspace
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
