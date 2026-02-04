import { useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Shield,
  Loader2,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '../../../stores';
import { ClaudeIcon } from '../../icons/ClaudeIcon';

export function IntegrationsSection() {
  const claudeCliStatus = useSettingsStore((state) => state.claudeCliStatus);
  const isLoading = useSettingsStore((state) => state.isClaudeCliLoading);
  const setClaudeCliStatus = useSettingsStore((state) => state.setClaudeCliStatus);
  const setClaudeCliLoading = useSettingsStore((state) => state.setClaudeCliLoading);

  const refreshStatus = useCallback(async () => {
    setClaudeCliLoading(true);
    try {
      // Check if Electron API is available for CLI detection
      if (window.electronAPI?.claude?.getStatus) {
        const status = await window.electronAPI.claude.getStatus();
        setClaudeCliStatus(status);
      } else {
        // Fallback: show not available in web mode
        setClaudeCliStatus({
          installed: false,
          platform: 'web',
          arch: 'unknown',
          auth: { authenticated: false },
        });
      }
    } catch (error) {
      console.error('Failed to get Claude CLI status:', error);
      setClaudeCliStatus(null);
    }
  }, [setClaudeCliStatus, setClaudeCliLoading]);

  // Fetch status on mount
  useEffect(() => {
    if (!claudeCliStatus && !isLoading) {
      refreshStatus();
    }
  }, [claudeCliStatus, isLoading, refreshStatus]);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-orange-500/20 to-orange-600/10',
            'ring-1 ring-orange-500/20',
          )}
        >
          <ClaudeIcon size={20} className="text-orange-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Claude CLI</h2>
          <p className="text-sm text-muted-foreground">
            Claude Code CLI installation status
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh Claude CLI status"
          onClick={refreshStatus}
          disabled={isLoading}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title="Refresh status"
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Loading State */}
      {isLoading && !claudeCliStatus && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Detecting Claude CLI...</span>
          </div>
        </div>
      )}

      {/* Status Cards */}
      {claudeCliStatus && (
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
                  Claude Code command-line interface
                </p>
              </div>
              {claudeCliStatus.installed ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-status-success bg-status-success-bg px-2 py-1 rounded-full">
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

            {claudeCliStatus.installed ? (
              <div className="space-y-2 text-sm">
                {claudeCliStatus.version && (
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-muted-foreground">Version</span>
                    <span className="text-foreground font-mono">
                      {claudeCliStatus.version}
                    </span>
                  </div>
                )}
                {claudeCliStatus.path && (
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-muted-foreground">Path</span>
                    <span
                      className="text-foreground font-mono text-xs max-w-[300px] truncate"
                      title={claudeCliStatus.path}
                    >
                      {claudeCliStatus.path}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-muted-foreground">Detection Method</span>
                  <span className="text-foreground capitalize">
                    {claudeCliStatus.method === 'path' ? 'System PATH' : 'Local Installation'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>Claude CLI is not installed or not found in your PATH.</p>
                <p className="mt-2">
                  Install it by running:{' '}
                  <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                    npm install -g @anthropic-ai/claude-code
                  </code>
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
                <p className="text-xs text-muted-foreground">OAuth sign-in status</p>
              </div>
              {claudeCliStatus.auth.authenticated ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-status-success bg-status-success-bg px-2 py-1 rounded-full">
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

            {!claudeCliStatus.auth.authenticated && (
              <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>You need to sign in to use Claude CLI.</p>
                <p className="mt-2">
                  Run{' '}
                  <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                    claude login
                  </code>{' '}
                  in your terminal to authenticate.
                </p>
              </div>
            )}

            {claudeCliStatus.auth.authenticated && (
              <div className="p-3 rounded-lg bg-status-success-bg text-sm text-status-success">
                OAuth token found. You're ready to use Claude CLI.
              </div>
            )}
          </div>

          {/* System Info */}
          <div className="text-xs text-muted-foreground text-center">
            Platform: {claudeCliStatus.platform} ({claudeCliStatus.arch})
          </div>
        </div>
      )}
    </div>
  );
}
