import { Loader2, RefreshCw, Terminal, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@omniscribe/ui';
import { PluginEvents } from '@omniscribe/shared';
import { usePluginStore } from '@/stores/usePluginStore';
import { emitAsync } from '@omniscribe/ui';
import { CodexIcon } from './CodexIcon';
import { CodexAuthCard } from './CodexAuthCard';

/**
 * Codex settings section.
 *
 * Displays CLI detection status, version, path, and authentication state
 * for the OpenAI Codex provider. Reads provider info from the plugin store
 * which is populated by backend CLI detection.
 */
export function CodexSettingsSection() {
  const provider = usePluginStore(state => state.providers.find(p => p.id === 'provider-codex'));
  const cliStatus = provider?.cliStatus;

  const handleRefresh = async () => {
    // Re-fetch provider list to get fresh CLI status
    try {
      const providers = await emitAsync<Record<string, never>, any[]>(
        PluginEvents.LIST_PROVIDERS,
        {}
      );
      usePluginStore.getState().setProviders(providers);
    } catch {
      // Refresh failed silently
    }
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-linear-to-br from-[#10A37F]/20 to-[#10A37F]/10',
            'ring-1 ring-[#10A37F]/20'
          )}
        >
          <CodexIcon size={20} className="text-[#10A37F]" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Codex</h2>
          <p className="text-sm text-muted-foreground">OpenAI</p>
        </div>
        <button
          type="button"
          aria-label="Refresh Codex CLI status"
          onClick={handleRefresh}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title="Refresh status"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Loading State */}
      {!cliStatus && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Detecting Codex CLI...</span>
          </div>
        </div>
      )}

      {/* Status Cards */}
      {cliStatus && (
        <div className="space-y-4">
          {/* CLI Status Card */}
          <div className="rounded-xl border border-border/50 bg-card/50 p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                <Terminal className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground">CLI Installation</h3>
                <p className="text-xs text-muted-foreground">Codex command-line interface</p>
              </div>
              {cliStatus.installed ? (
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

            {cliStatus.installed ? (
              <div className="space-y-2 text-sm">
                {cliStatus.version && (
                  <div className="flex items-center justify-between py-2 border-b border-border/30">
                    <span className="text-muted-foreground">Version</span>
                    <span className="text-foreground font-mono">{cliStatus.version}</span>
                  </div>
                )}
                {cliStatus.path && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-muted-foreground">Path</span>
                    <span
                      className="text-foreground font-mono text-xs max-w-[300px] truncate"
                      title={cliStatus.path}
                    >
                      {cliStatus.path}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <p>Codex CLI is not installed or not found in your PATH.</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  <p>
                    Install with{' '}
                    <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">
                      npm install -g @openai/codex
                    </code>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Auth Card */}
          <CodexAuthCard authenticated={cliStatus.auth?.authenticated ?? false} />
        </div>
      )}
    </div>
  );
}
