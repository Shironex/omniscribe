import { useState } from 'react';
import { FileText, FolderOpen, ScrollText } from 'lucide-react';
import { createLogger } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';
import { LogViewerModal } from '@/components/settings/LogViewerModal';

const logger = createLogger('DiagnosticsCard');

export function DiagnosticsCard() {
  const [logViewerOpen, setLogViewerOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-border/50 bg-card/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="text-sm font-medium text-foreground">Diagnostics</h3>
              <p className="text-xs text-muted-foreground">
                View application logs for troubleshooting
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLogViewerOpen(true)}>
              <ScrollText className="w-3.5 h-3.5" />
              View Logs
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                try {
                  window.electronAPI?.app?.openLogsFolder();
                } catch (err) {
                  logger.error('Failed to open logs folder:', err);
                }
              }}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              Open Log Folder
            </Button>
          </div>
        </div>
      </div>
      <LogViewerModal open={logViewerOpen} onOpenChange={setLogViewerOpen} />
    </>
  );
}
