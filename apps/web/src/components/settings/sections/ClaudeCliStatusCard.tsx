import {
  CheckCircle2,
  XCircle,
  Terminal,
  Loader2,
  ArrowUpCircle,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { ClaudeCliStatus, ClaudeVersionCheckResult } from '@omniscribe/shared';

interface ClaudeCliStatusCardProps {
  claudeCliStatus: ClaudeCliStatus;
  claudeVersionCheck: ClaudeVersionCheckResult | null;
  isVersionCheckLoading: boolean;
  availableVersions: string[];
  isVersionsLoading: boolean;
  showVersionPicker: boolean;
  onInstallClick: () => void;
  onVersionPickerOpen: () => void;
  onVersionSelect: (version: string) => void;
  onGetInstallCommand: (isUpdate: boolean) => Promise<void>;
}

export function ClaudeCliStatusCard({
  claudeCliStatus,
  claudeVersionCheck,
  isVersionCheckLoading,
  availableVersions,
  isVersionsLoading,
  showVersionPicker,
  onInstallClick,
  onVersionPickerOpen,
  onVersionSelect,
  onGetInstallCommand,
}: ClaudeCliStatusCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Terminal className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">CLI Installation</h3>
          <p className="text-xs text-muted-foreground">Claude Code command-line interface</p>
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
                <span className="text-foreground font-mono">{claudeCliStatus.version}</span>
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
                onClick={onInstallClick}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors'
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
                onClick={onVersionPickerOpen}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-muted text-muted-foreground',
                  'hover:bg-muted/80 hover:text-foreground transition-colors'
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
                    'rounded-lg border border-border bg-popover shadow-lg'
                  )}
                >
                  {availableVersions.map(version => (
                    <button
                      type="button"
                      key={version}
                      onClick={() => onVersionSelect(version)}
                      className={clsx(
                        'w-full px-3 py-2 text-left text-xs font-mono',
                        'hover:bg-muted transition-colors',
                        version === claudeCliStatus.version &&
                          'bg-muted text-foreground font-medium'
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
            onClick={() => onGetInstallCommand(false)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors'
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            Install Claude CLI
          </button>
        </div>
      )}
    </div>
  );
}
