import { Loader2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import { useClaudeCliStatus } from '@/hooks/useClaudeCliStatus';
import { ClaudeCliStatusCard } from './ClaudeCliStatusCard';
import { ClaudeAuthCard } from './ClaudeAuthCard';
import { InstallCommandDisplay } from './InstallCommandDisplay';

export function IntegrationsSection() {
  const {
    claudeCliStatus,
    isLoading,
    claudeVersionCheck,
    isVersionCheckLoading,
    availableVersions,
    isVersionsLoading,
    showVersionPicker,
    installCommand,
    copiedCommand,
    refreshStatus,
    checkVersion,
    handleVersionPickerOpen,
    handleVersionSelect,
    handleInstallClick,
    copyCommand,
    runInTerminal,
    getInstallCommand,
  } = useClaudeCliStatus();

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-orange-500/20 to-orange-600/10',
            'ring-1 ring-orange-500/20'
          )}
        >
          <ClaudeIcon size={20} className="text-orange-400" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Claude CLI</h2>
          <p className="text-sm text-muted-foreground">Claude Code CLI installation status</p>
        </div>
        <button
          type="button"
          aria-label="Refresh Claude CLI status"
          onClick={() => {
            refreshStatus();
            checkVersion();
          }}
          disabled={isLoading || isVersionCheckLoading}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Refresh status"
        >
          {isLoading || isVersionCheckLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
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
          <ClaudeCliStatusCard
            claudeCliStatus={claudeCliStatus}
            claudeVersionCheck={claudeVersionCheck}
            isVersionCheckLoading={isVersionCheckLoading}
            availableVersions={availableVersions}
            isVersionsLoading={isVersionsLoading}
            showVersionPicker={showVersionPicker}
            onInstallClick={handleInstallClick}
            onVersionPickerOpen={handleVersionPickerOpen}
            onVersionSelect={handleVersionSelect}
            onGetInstallCommand={getInstallCommand}
          />

          {installCommand && (
            <InstallCommandDisplay
              installCommand={installCommand}
              copiedCommand={copiedCommand}
              onCopy={copyCommand}
              onRunInTerminal={runInTerminal}
            />
          )}

          <ClaudeAuthCard authenticated={claudeCliStatus.auth.authenticated} />

          <div className="text-xs text-muted-foreground text-center">
            Platform: {claudeCliStatus.platform} ({claudeCliStatus.arch})
          </div>
        </div>
      )}
    </div>
  );
}
