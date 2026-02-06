import { useState, useEffect } from 'react';
import {
  Info,
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';
import { APP_NAME, GITHUB_RELEASES_URL, createLogger } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Progress } from '@/components/ui/progress';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { IS_MAC } from '@/lib/platform';

const logger = createLogger('GeneralSection');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MacDownloadFallback({ message }: { message: string }) {
  return (
    <div className="space-y-2">
      <Button size="sm" onClick={() => window.open(GITHUB_RELEASES_URL, '_blank')}>
        <ExternalLink className="w-3.5 h-3.5" />
        Download from GitHub
      </Button>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function GeneralSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const { status, updateInfo, progress, error, checkForUpdates, startDownload, installNow } =
    useUpdateStore();

  const openGitHubReleases = () => window.open(GITHUB_RELEASES_URL, '_blank');

  useEffect(() => {
    async function fetchVersion() {
      if (window.electronAPI?.app?.getVersion) {
        try {
          logger.debug('Fetching app version');
          const v = await window.electronAPI.app.getVersion();
          setVersion(v);
        } catch (err) {
          logger.error('Failed to get app version:', err);
        }
      }
    }
    fetchVersion();
  }, []);

  const handleCheckForUpdates = () => {
    setHasChecked(true);
    checkForUpdates();
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-brand-600/10',
            'ring-1'
          )}
          style={
            {
              '--tw-ring-color': 'color-mix(in oklch, var(--primary), transparent 80%)',
            } as React.CSSProperties
          }
        >
          <Info className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">About</h2>
          <p className="text-sm text-muted-foreground">Application information</p>
        </div>
      </div>

      {/* About Card */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6">
        <div className="text-center space-y-3">
          <div className="text-xl font-bold text-gradient">{APP_NAME}</div>
          {version && <div className="text-sm font-mono text-primary">v{version}</div>}
          <div className="text-sm text-muted-foreground">AI-powered development workspace</div>
        </div>
      </div>

      {/* Updates Card */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Updates</h3>
          {status !== 'downloading' && status !== 'ready' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckForUpdates}
              disabled={status === 'checking'}
            >
              <RefreshCw className={clsx('w-3.5 h-3.5', status === 'checking' && 'animate-spin')} />
              {status === 'checking' ? 'Checking...' : 'Check for Updates'}
            </Button>
          )}
        </div>

        {/* Status: Up to date */}
        {status === 'idle' && hasChecked && (
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4" />
            <span>You're up to date!</span>
          </div>
        )}

        {/* Status: Update available */}
        {status === 'available' && updateInfo && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">
                Version{' '}
                <span className="font-mono font-semibold text-primary">{updateInfo.version}</span>{' '}
                is available
              </span>
            </div>
            {updateInfo.releaseNotes && (
              <div className="rounded-lg border border-border/50 bg-background/50 p-3 max-h-48 overflow-y-auto">
                <Markdown>{updateInfo.releaseNotes}</Markdown>
              </div>
            )}
            {IS_MAC ? (
              <MacDownloadFallback message="Auto-install is not available on macOS without code signing." />
            ) : (
              <Button size="sm" onClick={startDownload}>
                <Download className="w-3.5 h-3.5" />
                Download Update
              </Button>
            )}
          </div>
        )}

        {/* Status: Downloading (non-macOS only) */}
        {status === 'downloading' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Downloading update...</span>
                {progress && <span>{progress.percent.toFixed(0)}%</span>}
              </div>
              <Progress value={progress?.percent ?? 0} />
              {progress && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {formatBytes(progress.transferred)} / {formatBytes(progress.total)}
                  </span>
                  <span>{formatBytes(progress.bytesPerSecond)}/s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status: Ready to install */}
        {status === 'ready' && (
          <div className="space-y-3">
            {IS_MAC ? (
              <>
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Update verified, but auto-install is unavailable on macOS.</span>
                </div>
                <MacDownloadFallback message="Please download the latest version manually." />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Update downloaded. Restart to install.</span>
                </div>
                <Button size="sm" onClick={installNow}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restart & Install
                </Button>
              </>
            )}
          </div>
        )}

        {/* Status: Error */}
        {status === 'error' && error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            {IS_MAC && (
              <Button size="sm" variant="outline" onClick={openGitHubReleases}>
                <ExternalLink className="w-3.5 h-3.5" />
                Download from GitHub
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
