import { useEffect, useCallback } from 'react';
import { createLogger } from '@omniscribe/shared';
import {
  GitPullRequest,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Shield,
  Loader2,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { StatusPill } from '@/components/shared/StatusPill';

const logger = createLogger('GithubSection');

export function GithubSection() {
  const githubCliStatus = useSettingsStore(state => state.githubCliStatus);
  const isLoading = useSettingsStore(state => state.isGithubCliLoading);
  const setGithubCliStatus = useSettingsStore(state => state.setGithubCliStatus);
  const setGithubCliLoading = useSettingsStore(state => state.setGithubCliLoading);

  const refreshStatus = useCallback(async () => {
    logger.debug('Fetching GitHub CLI status');
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
      logger.error('Failed to get GitHub CLI status:', error);
      setGithubCliStatus(null);
    }
  }, [setGithubCliStatus, setGithubCliLoading]);

  useEffect(() => {
    if (!githubCliStatus && !isLoading) {
      refreshStatus();
    }
  }, [githubCliStatus, isLoading, refreshStatus]);

  const refreshButton = (
    <button
      type="button"
      aria-label="Refresh GitHub CLI status"
      onClick={refreshStatus}
      disabled={isLoading}
      className={cn(
        'p-2 rounded-lg transition-colors',
        'hover:bg-muted text-muted-foreground hover:text-foreground',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      )}
      title="Refresh status"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <RefreshCw className="w-4 h-4" />
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={GitPullRequest}
        tone="muted"
        title="GitHub CLI"
        subtitle="GitHub CLI (gh) for PRs, issues, and more."
        headerAccessory={refreshButton}
      >
        {isLoading && !githubCliStatus && (
          <div className="flex items-center justify-center gap-3 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Detecting GitHub CLI...</span>
          </div>
        )}

        {githubCliStatus && (
          <>
            {/* CLI Installation row */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Terminal className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  CLI Installation
                </p>
                <p className="text-[12px] text-muted-foreground/85 leading-snug">
                  GitHub command-line interface
                </p>
              </div>
              {githubCliStatus.installed ? (
                <StatusPill tone="ready" icon={CheckCircle2}>
                  Installed
                </StatusPill>
              ) : (
                <StatusPill tone="warning" icon={XCircle}>
                  Not Found
                </StatusPill>
              )}
            </div>

            {githubCliStatus.installed ? (
              <div className="space-y-1 text-sm pl-11">
                {githubCliStatus.version && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border-glass/60">
                    <span className="text-muted-foreground text-xs">Version</span>
                    <span className="text-foreground font-mono text-xs">
                      {githubCliStatus.version}
                    </span>
                  </div>
                )}
                {githubCliStatus.path && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border-glass/60">
                    <span className="text-muted-foreground text-xs">Path</span>
                    <span
                      className="text-foreground font-mono text-xs max-w-[300px] truncate"
                      title={githubCliStatus.path}
                    >
                      {githubCliStatus.path}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-muted-foreground text-xs">Detection method</span>
                  <span className="text-foreground capitalize text-xs">
                    {githubCliStatus.method === 'path' ? 'System PATH' : 'Local Installation'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
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

            {/* Authentication row */}
            <div className="border-t border-border-glass/60 pt-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  Authentication
                </p>
                <p className="text-[12px] text-muted-foreground/85 leading-snug">
                  GitHub account sign-in
                </p>
              </div>
              {githubCliStatus.auth.authenticated ? (
                <StatusPill tone="ready" icon={CheckCircle2}>
                  Signed In
                </StatusPill>
              ) : (
                <StatusPill tone="warning" icon={XCircle}>
                  Not Signed In
                </StatusPill>
              )}
            </div>

            {githubCliStatus.auth.authenticated ? (
              <div className="space-y-2 pl-11">
                {githubCliStatus.auth.username && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 text-sm text-primary">
                    <User className="w-4 h-4" />
                    <span>
                      Logged in as <strong>{githubCliStatus.auth.username}</strong>
                    </span>
                  </div>
                )}
                {githubCliStatus.auth.scopes && githubCliStatus.auth.scopes.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/40 text-sm">
                    <span className="text-muted-foreground">Token scopes: </span>
                    <span className="text-foreground font-mono text-xs">
                      {githubCliStatus.auth.scopes.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-muted/40 text-sm text-muted-foreground">
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

            <div className="text-xs text-muted-foreground/70 text-center border-t border-border-glass/60 pt-3">
              Platform: {githubCliStatus.platform} ({githubCliStatus.arch})
            </div>
          </>
        )}
      </SettingsCard>
    </div>
  );
}
