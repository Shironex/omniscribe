import { useEffect, useCallback, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Shield,
  Loader2,
  ArrowUpCircle,
  ArrowRight,
  Copy,
  Check,
  ChevronDown,
  Play,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useSettingsStore } from '@/stores';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';

export function IntegrationsSection() {
  const claudeCliStatus = useSettingsStore((state) => state.claudeCliStatus);
  const isLoading = useSettingsStore((state) => state.isClaudeCliLoading);
  const setClaudeCliStatus = useSettingsStore((state) => state.setClaudeCliStatus);
  const setClaudeCliLoading = useSettingsStore((state) => state.setClaudeCliLoading);

  const claudeVersionCheck = useSettingsStore((state) => state.claudeVersionCheck);
  const isVersionCheckLoading = useSettingsStore((state) => state.isVersionCheckLoading);
  const setClaudeVersionCheck = useSettingsStore((state) => state.setClaudeVersionCheck);
  const setVersionCheckLoading = useSettingsStore((state) => state.setVersionCheckLoading);

  const availableVersions = useSettingsStore((state) => state.availableVersions);
  const isVersionsLoading = useSettingsStore((state) => state.isVersionsLoading);
  const setAvailableVersions = useSettingsStore((state) => state.setAvailableVersions);
  const setVersionsLoading = useSettingsStore((state) => state.setVersionsLoading);

  const [showVersionPicker, setShowVersionPicker] = useState(false);
  const [installCommand, setInstallCommand] = useState<{
    command: string;
    description: string;
  } | null>(null);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const [versionCheckAttempted, setVersionCheckAttempted] = useState(false);

  const refreshStatus = useCallback(async () => {
    setClaudeCliLoading(true);
    try {
      if (window.electronAPI?.claude?.getStatus) {
        const status = await window.electronAPI.claude.getStatus();
        setClaudeCliStatus(status);
      } else {
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

  const checkVersion = useCallback(async () => {
    setVersionCheckLoading(true);
    setVersionCheckAttempted(true);
    try {
      if (window.electronAPI?.claude?.checkVersion) {
        const result = await window.electronAPI.claude.checkVersion();
        setClaudeVersionCheck(result);
      }
    } catch (error) {
      console.error('Failed to check Claude CLI version:', error);
      setClaudeVersionCheck(null);
    }
  }, [setClaudeVersionCheck, setVersionCheckLoading]);

  const fetchVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      if (window.electronAPI?.claude?.getVersions) {
        const result = await window.electronAPI.claude.getVersions();
        setAvailableVersions(result.versions);
      }
    } catch (error) {
      console.error('Failed to fetch available versions:', error);
      setAvailableVersions([]);
    }
  }, [setAvailableVersions, setVersionsLoading]);

  const getInstallCommand = useCallback(
    async (isUpdate: boolean, version?: string) => {
      try {
        if (window.electronAPI?.claude?.getInstallCommand) {
          const result = await window.electronAPI.claude.getInstallCommand({
            isUpdate,
            version,
          });
          setInstallCommand(result);
        }
      } catch (error) {
        console.error('Failed to get install command:', error);
      }
    },
    [],
  );

  const copyCommand = useCallback(async () => {
    if (installCommand?.command) {
      await navigator.clipboard.writeText(installCommand.command);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    }
  }, [installCommand]);

  const runInTerminal = useCallback(async () => {
    if (installCommand?.command && window.electronAPI?.claude?.runInstall) {
      try {
        await window.electronAPI.claude.runInstall(installCommand.command);
      } catch (error) {
        console.error('Failed to open terminal:', error);
      }
    }
  }, [installCommand]);

  // Fetch status on mount
  useEffect(() => {
    if (!claudeCliStatus && !isLoading) {
      refreshStatus();
    }
  }, [claudeCliStatus, isLoading, refreshStatus]);

  // Check version after status is loaded (only once)
  useEffect(() => {
    if (
      claudeCliStatus?.installed &&
      !claudeVersionCheck &&
      !isVersionCheckLoading &&
      !versionCheckAttempted
    ) {
      checkVersion();
    }
  }, [claudeCliStatus, claudeVersionCheck, isVersionCheckLoading, versionCheckAttempted, checkVersion]);

  // Handle version picker open
  const handleVersionPickerOpen = () => {
    if (availableVersions.length === 0 && !isVersionsLoading) {
      fetchVersions();
    }
    setShowVersionPicker(!showVersionPicker);
  };

  // Handle version selection
  const handleVersionSelect = (version: string) => {
    getInstallCommand(claudeCliStatus?.installed ?? false, version);
    setShowVersionPicker(false);
  };

  // Handle update/install button click
  const handleInstallClick = () => {
    const isUpdate = claudeCliStatus?.installed ?? false;
    const version = claudeVersionCheck?.latestVersion;
    getInstallCommand(isUpdate, isUpdate ? version : undefined);
  };

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
          onClick={() => {
            refreshStatus();
            setVersionCheckAttempted(false);
            checkVersion();
          }}
          disabled={isLoading || isVersionCheckLoading}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title="Refresh status"
        >
          <RefreshCw
            className={clsx(
              'w-4 h-4',
              (isLoading || isVersionCheckLoading) && 'animate-spin',
            )}
          />
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
              <div className="flex items-center gap-2">
                {/* Update Available Badge */}
                {claudeVersionCheck?.isOutdated && (
                  <span className="flex items-center gap-1 text-xs font-medium text-status-warning bg-status-warning-bg px-2 py-1 rounded-full">
                    <ArrowUpCircle className="w-3 h-3" />
                    Update Available
                  </span>
                )}
                {claudeCliStatus.installed ? (
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
            </div>

            {claudeCliStatus.installed ? (
              <div className="space-y-2 text-sm">
                {/* Version with update indicator */}
                {claudeCliStatus.version && (
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-muted-foreground">Version</span>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-mono">
                        {claudeCliStatus.version}
                      </span>
                      {claudeVersionCheck?.isOutdated && claudeVersionCheck.latestVersion && (
                        <>
                          <ArrowRight className="w-3 h-3 text-muted-foreground" />
                          <span className="font-mono text-primary">
                            {claudeVersionCheck.latestVersion}
                          </span>
                        </>
                      )}
                      {isVersionCheckLoading && (
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
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

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-3 border-t border-border/30">
                  {claudeVersionCheck?.isOutdated && (
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                        'bg-primary text-primary-foreground',
                        'hover:bg-primary/90 transition-colors',
                      )}
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      Update to {claudeVersionCheck.latestVersion}
                    </button>
                  )}

                  {/* Version Picker */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={handleVersionPickerOpen}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                        'bg-muted text-muted-foreground',
                        'hover:bg-muted/80 hover:text-foreground transition-colors',
                      )}
                    >
                      Change Version
                      {isVersionsLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {showVersionPicker && availableVersions.length > 0 && (
                      <div
                        className={clsx(
                          'absolute top-full left-0 mt-1 z-50',
                          'w-40 max-h-60 overflow-y-auto',
                          'rounded-lg border border-border bg-popover shadow-lg',
                        )}
                      >
                        {availableVersions.map((version) => (
                          <button
                            type="button"
                            key={version}
                            onClick={() => handleVersionSelect(version)}
                            className={clsx(
                              'w-full px-3 py-2 text-left text-xs font-mono',
                              'hover:bg-muted transition-colors',
                              version === claudeCliStatus.version &&
                                'bg-muted text-foreground font-medium',
                            )}
                          >
                            {version}
                            {version === claudeCliStatus.version && ' (current)'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <p>Claude CLI is not installed or not found in your PATH.</p>
                </div>
                <button
                  type="button"
                  onClick={() => getInstallCommand(false)}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors',
                  )}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  Install Claude CLI
                </button>
              </div>
            )}
          </div>

          {/* Install Command Display */}
          {installCommand && (
            <div className="rounded-xl border border-border/50 bg-card/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  {installCommand.description}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyCommand}
                    className={clsx(
                      'flex items-center gap-1 px-2 py-1 rounded text-xs',
                      'hover:bg-muted transition-colors',
                      copiedCommand
                        ? 'text-status-success'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {copiedCommand ? (
                      <>
                        <Check className="w-3 h-3" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted font-mono text-xs text-foreground overflow-x-auto">
                {installCommand.command}
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-muted-foreground">
                  Click the button to open a terminal with this command.
                </p>
                <button
                  type="button"
                  onClick={runInTerminal}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors',
                  )}
                >
                  <Play className="w-3.5 h-3.5" />
                  Run in Terminal
                </button>
              </div>
            </div>
          )}

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
              <div className="p-3 rounded-lg bg-primary/10 text-sm text-primary">
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
