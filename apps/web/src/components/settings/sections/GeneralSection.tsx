import { useState, useEffect } from 'react';
import { Settings, FolderOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { APP_NAME } from '@omniscribe/shared';

export function GeneralSection() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersion() {
      if (window.electronAPI?.app?.getVersion) {
        try {
          const v = await window.electronAPI.app.getVersion();
          setVersion(v);
        } catch (error) {
          console.error('Failed to get app version:', error);
        }
      }
    }
    fetchVersion();
  }, []);

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
            <div className="text-lg font-bold text-gradient">{APP_NAME}</div>
            {version && (
              <div className="text-sm font-mono text-primary">v{version}</div>
            )}
            <div className="text-xs text-muted-foreground">
              AI-powered development workspace
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
