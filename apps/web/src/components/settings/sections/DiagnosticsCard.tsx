import { useState } from 'react';
import { FileText, FolderOpen, ScrollText, Eye } from 'lucide-react';
import { createLogger } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { LogViewerModal } from '@/components/settings/LogViewerModal';
import { SettingsCard, SettingsRow, SettingsRowLabel } from '@/components/settings/SettingsCard';
import { DiagnosticsPreview } from '@/components/settings/previews/DiagnosticsPreview';

const logger = createLogger('DiagnosticsCard');

export function DiagnosticsCard() {
  const [logViewerOpen, setLogViewerOpen] = useState(false);

  return (
    <>
      <div className="space-y-4">
        <SettingsCard
          icon={Eye}
          tone="blue"
          title="Preview"
          subtitle="Sample of the structured log lines you'll see."
        >
          <DiagnosticsPreview />
        </SettingsCard>
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
      </div>
      <LogViewerModal open={logViewerOpen} onOpenChange={setLogViewerOpen} />
    </>
  );
}
