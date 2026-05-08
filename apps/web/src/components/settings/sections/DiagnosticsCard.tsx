import { useState } from 'react';
import { FileText, FolderOpen, ScrollText } from 'lucide-react';
import { createLogger } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { LogViewerModal } from '@/components/settings/LogViewerModal';
import { SettingsCard, SettingsRow, SettingsRowLabel } from '@/components/settings/SettingsCard';

const logger = createLogger('DiagnosticsCard');

export function DiagnosticsCard() {
  const [logViewerOpen, setLogViewerOpen] = useState(false);

  return (
    <>
      <SettingsCard
        icon={FileText}
        tone="muted"
        title="Diagnostics"
        subtitle="View application logs for troubleshooting."
      >
        <SettingsRow>
          <SettingsRowLabel
            title="Application logs"
            description="Inspect recent log lines or open the log folder on disk."
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLogViewerOpen(true)}>
              <ScrollText className="w-3.5 h-3.5" />
              View Logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await window.electronAPI?.app?.openLogsFolder();
                } catch (err) {
                  logger.error('Failed to open logs folder:', err);
                }
              }}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open Log Folder
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>
      <LogViewerModal open={logViewerOpen} onOpenChange={setLogViewerOpen} />
    </>
  );
}
