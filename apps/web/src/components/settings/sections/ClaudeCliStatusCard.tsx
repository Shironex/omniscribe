import {
  CheckCircle2,
  XCircle,
  Terminal,
  Loader2,
  ArrowUpCircle,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClaudeCliStatus, ClaudeVersionCheckResult } from '@omniscribe/shared';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { StatusPill } from '@/components/shared/StatusPill';

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
    <SettingsCard
      icon={Terminal}
      tone="muted"
      title="CLI Installation"
      subtitle="Claude Code command-line interface"
      headerAccessory={
        <div className="flex items-center gap-2">
          {claudeVersionCheck?.isOutdated && (
            <StatusPill tone="warning" icon={ArrowUpCircle}>
              Update Available
            </StatusPill>
          )}
          {claudeCliStatus.installed ? (
            <StatusPill tone="ready" icon={CheckCircle2}>
              Installed
            </StatusPill>
          ) : (
            <StatusPill tone="warning" icon={XCircle}>
              Not Found
            </StatusPill>
          )}
        </div>
      }
    >
      {claudeCliStatus.installed ? (
        <div className="space-y-2 text-sm">
          {claudeCliStatus.version && (
            <div className="flex items-center justify-between py-2 border-b border-border-glass/60">
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
            <div className="flex items-center justify-between py-2 border-b border-border-glass/60">
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

          <div className="flex items-center gap-2 pt-3 border-t border-border-glass/60">
            {claudeVersionCheck?.isOutdated && (
              <button
                type="button"
                onClick={onInstallClick}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
                )}
              >
                <ArrowUpCircle className="w-3.5 h-3.5" />
                Update to {claudeVersionCheck.latestVersion}
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={onVersionPickerOpen}
                aria-expanded={showVersionPicker}
                aria-haspopup="listbox"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                  'bg-muted text-muted-foreground',
                  'hover:bg-muted/80 hover:text-foreground transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
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
                  role="listbox"
                  aria-label="Available versions"
                  className={cn(
                    'absolute top-full left-0 mt-1 z-50',
                    'w-40 max-h-60 overflow-y-auto',
                    'rounded-lg border border-border bg-popover shadow-lg'
                  )}
                >
                  {availableVersions.map(version => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={version === claudeCliStatus.version}
                      key={version}
                      onClick={() => onVersionSelect(version)}
                      className={cn(
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
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            Install Claude CLI
          </button>
        </div>
      )}
    </SettingsCard>
  );
}
