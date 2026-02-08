import { Copy, Check, Play, TriangleAlert } from 'lucide-react';
import { clsx } from 'clsx';
import type { ClaudeInstallCommand } from '@omniscribe/shared';
import { Button } from '@/components/ui/button';

interface InstallCommandDisplayProps {
  installCommand: ClaudeInstallCommand;
  copiedCommand: boolean;
  isUpdate?: boolean;
  onCopy: () => Promise<void>;
  onRunInTerminal: () => Promise<void>;
}

export function InstallCommandDisplay({
  installCommand,
  copiedCommand,
  isUpdate,
  onCopy,
  onRunInTerminal,
}: InstallCommandDisplayProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{installCommand.description}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCopy}
            className={clsx('text-xs', copiedCommand ? 'text-status-success' : '')}
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
          </Button>
        </div>
      </div>
      <div className="p-3 rounded-lg bg-muted font-mono text-xs text-foreground overflow-x-auto">
        {installCommand.command}
      </div>

      {isUpdate && (
        <div
          role="alert"
          className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-status-warning-bg/50 border border-status-warning/20"
        >
          <TriangleAlert className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
          <p className="text-xs text-status-warning">
            This will terminate all running Claude CLI instances. Make sure all your tasks are
            completed before updating.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground">
          Click the button to open a terminal with this command.
        </p>
        <Button variant="default" size="sm" onClick={onRunInTerminal} className="text-xs">
          <Play className="w-3.5 h-3.5" />
          Run in Terminal
        </Button>
      </div>
    </div>
  );
}
