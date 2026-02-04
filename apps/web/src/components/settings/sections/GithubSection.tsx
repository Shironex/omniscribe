import { useEffect, useCallback } from 'react';
import {
  Github,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Shield,
  Loader2,
  User,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '@/stores';

export function GithubSection() {
  const githubCliStatus = useSettingsStore((state) => state.githubCliStatus);
  const isLoading = useSettingsStore((state) => state.isGithubCliLoading);
  const setGithubCliStatus = useSettingsStore((state) => state.setGithubCliStatus);
  const setGithubCliLoading = useSettingsStore((state) => state.setGithubCliLoading);

  const refreshStatus = useCallback(async () => {
    setGithubCliLoading(true);
    try {
      if (window.electronAPI?.github?.getStatus) {
        const status = await window.electronAPI.github.getStatus();
        setGithubCliStatus(status);
      } else {
        setGithubCliStatus({
          installed: false,
          platform: 'web',
          arch: 'unknown',
          auth: { authenticated: false },
        });
      }
    } catch (error) {
      console.error('Failed to get GitHub CLI status:', error);
      setGithubCliStatus(null);
    }
  }, [setGithubCliStatus, setGithubCliLoading]);

  // Fetch status on mount
  useEffect(() => {
    if (!githubCliStatus && !isLoading) {
      refreshStatus();
    }
  }, [githubCliStatus, isLoading, refreshStatus]);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-brand-600/10',
            'ring-1',
          )}
          style={{ '--tw-ring-color': 'color-mix(in oklch, var(--primary), transparent 80%)' } as React.CSSProperties}
        >
          <Github className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">GitHub CLI</h2>
          <p className="text-sm text-muted-foreground">
            GitHub CLI (gh) for PRs, issues, and more
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh GitHub CLI status"
          onClick={refreshStatus}
          disabled={isLoading}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title="Refresh status"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Loading State */}
      {isLoading && !githubCliStatus && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Detecting GitHub CLI...</span>
          </div>
        </div>
      )}

      {/* Status Cards */}
      {githubCliStatus && (
        <div className="space-y-4">
          {/* CLI Status Card */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Terminal className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground">
                  CLI Installation
                </h3>
                <p className="text-xs text-muted-foreground">
                  GitHub command-line interface
                </p>
              </div>
              {githubCliStatus.installed ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Installed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-status-warning bg-status-warning-bg px-2 py-1 rounded-full">
                  <XCircle className="w-3 h-3" />
                  Not Found
                </span>
              )}
            </div>

            {githubCliStatus.installed ? (
              <div className="space-y-2 text-sm">
                {githubCliStatus.version && (
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-muted-foreground">Version</span>
                    <span className="text-foreground font-mono">
                      {githubCliStatus.version}
                    </span>
                  </div>
                )}
                {githubCliStatus.path && (
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-muted-foreground">Path</span>
                    <span
                      className="text-foreground font-mono text-xs max-w-[300px] truncate"
                      title={githubCliStatus.path}
                    >
                      {githubCliStatus.path}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Detection Method</span>
                  <span className="text-foreground capitalize">
                    {githubCliStatus.method === 'path' ? 'System PATH' : 'Local Installation'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>GitHub CLI is not installed or not found in your PATH.</p>
                <p className="mt-2">
                  Install it from:{' '}
                  <a
                    href="https://cli.github.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://cli.github.com
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Authentication Card */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground">
                  Authentication
                </h3>
                <p className="text-xs text-muted-foreground">GitHub account sign-in</p>
              </div>
              {githubCliStatus.auth.authenticated ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
                  <CheckCircle2 className="w-3 h-3" />
                  Signed In
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-medium text-status-warning bg-status-warning-bg px-2 py-1 rounded-full">
                  <XCircle className="w-3 h-3" />
                  Not Signed In
                </span>
              )}
            </div>

            {githubCliStatus.auth.authenticated ? (
              <div className="space-y-2">
                {githubCliStatus.auth.username && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-sm text-primary">
                    <User className="w-4 h-4" />
                    <span>Logged in as <strong>{githubCliStatus.auth.username}</strong></span>
                  </div>
                )}
                {githubCliStatus.auth.scopes && githubCliStatus.auth.scopes.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="text-muted-foreground">Token scopes: </span>
                    <span className="text-foreground font-mono text-xs">
                      {githubCliStatus.auth.scopes.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>You need to sign in to use GitHub features.</p>
                <p className="mt-2">
                  Run{' '}
                  <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                    gh auth login
                  </code>{' '}
                  in your terminal to authenticate.
                </p>
              </div>
            )}
          </div>

          {/* System Info */}
          <div className="text-xs text-muted-foreground text-center">
            Platform: {githubCliStatus.platform} ({githubCliStatus.arch})
          </div>
        </div>
      )}
    </div>
  );
}
