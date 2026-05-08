import { useState } from 'react';
import {
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  ExternalLink,
  CloudDownload,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GITHUB_RELEASES_URL,
  UPDATE_ERROR_RELEASE_PENDING,
  formatFileSize,
} from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/markdown';
import { Progress } from '@/components/ui/progress';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useAppVersion } from '@/hooks/useAppVersion';
import { IS_MAC } from '@/lib/platform';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { ButtonGroup } from '@/components/shared/ButtonGroup';
import { UpdatesPreview } from '@/components/settings/previews/UpdatesPreview';

function MacDownloadFallback({ message }: { message: string }) {
  return (
    <div className="space-y-2">
      <Button
        size="sm"
        onClick={() => window.open(GITHUB_RELEASES_URL, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Download from GitHub
      </Button>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function UpdatesCard() {
  const version = useAppVersion();
  const [hasChecked, setHasChecked] = useState(false);
  const {
    status,
    updateInfo,
    progress,
    error,
    channel,
    isChannelSwitching,
    checkForUpdates,
    startDownload,
    installNow,
    setChannel,
  } = useUpdateStore();

  const openGitHubReleases = () =>
    window.open(GITHUB_RELEASES_URL, '_blank', 'noopener,noreferrer');

  const handleCheckForUpdates = () => {
    setHasChecked(true);
    checkForUpdates();
  };

  const checkButton = status !== 'downloading' && status !== 'ready' && (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCheckForUpdates}
      disabled={status === 'checking'}
    >
      <RefreshCw className={cn('w-3.5 h-3.5', status === 'checking' && 'animate-spin')} />
      {status === 'checking' ? 'Checking...' : 'Check for Updates'}
    </Button>
  );

  const channelDisabled = status === 'checking' || status === 'downloading' || isChannelSwitching;

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Eye}
        tone="blue"
        title="Preview"
        subtitle="Installed version, channel, and target release."
      >
        <UpdatesPreview />
      </SettingsCard>

      <SettingsCard
        icon={CloudDownload}
        tone="blue"
        title="Updates"
        subtitle="Stay on the latest stable release or opt into beta."
        headerAccessory={checkButton}
      >
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ButtonGroup
              ariaLabel="Update channel"
              value={channel}
              onChange={value => setChannel(value as 'stable' | 'beta')}
              options={[
                {
                  value: 'stable',
                  label: 'Stable',
                  disabled: channel === 'stable' || channelDisabled,
                },
                { value: 'beta', label: 'Beta', disabled: channel === 'beta' || channelDisabled },
              ]}
            />
            {isChannelSwitching && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {channel === 'beta'
              ? 'Receive pre-release updates with new features.'
              : 'Receive stable, tested releases only.'}
          </p>
        </div>

        {status === 'idle' && hasChecked && (
          <div className="flex items-center gap-2 text-sm text-status-success">
            <CheckCircle className="w-4 h-4" />
            <span>You're up to date!</span>
          </div>
        )}

        {status === 'available' && updateInfo && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">
                {updateInfo.isDowngrade ? (
                  <>
                    Stable version{' '}
                    <span className="font-mono font-semibold text-primary">
                      {updateInfo.version}
                    </span>{' '}
                    available (current: {version ?? 'unknown'})
                  </>
                ) : (
                  <>
                    Version{' '}
                    <span className="font-mono font-semibold text-primary">
                      {updateInfo.version}
                    </span>{' '}
                    is available
                  </>
                )}
              </span>
              {updateInfo.channel === 'beta' && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-status-warning-bg text-status-warning">
                  Beta
                </span>
              )}
            </div>
            {updateInfo.releaseNotes && (
              <div className="rounded-lg border border-border-glass bg-background/50 p-3 max-h-48 overflow-y-auto">
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
                    {formatFileSize(progress.transferred)} / {formatFileSize(progress.total)}
                  </span>
                  <span>{formatFileSize(progress.bytesPerSecond)}/s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-3">
            {IS_MAC ? (
              <>
                <div className="flex items-center gap-2 text-sm text-status-success">
                  <CheckCircle className="w-4 h-4" />
                  <span>Update verified, but auto-install is unavailable on macOS.</span>
                </div>
                <MacDownloadFallback message="Please download the latest version manually." />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-status-success">
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

        {status === 'error' && error === UPDATE_ERROR_RELEASE_PENDING && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm text-status-warning">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {channel === 'beta'
                  ? 'No beta release is currently available.'
                  : 'A new release is being prepared. The update should be available in 5–10 minutes.'}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={handleCheckForUpdates}>
              <RefreshCw className="w-3.5 h-3.5" />
              Recheck
            </Button>
          </div>
        )}

        {status === 'error' && error && error !== UPDATE_ERROR_RELEASE_PENDING && (
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
      </SettingsCard>
    </div>
  );
}
