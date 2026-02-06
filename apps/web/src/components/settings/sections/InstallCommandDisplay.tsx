import { Copy, Check, Play } from 'lucide-react';
import { clsx } from 'clsx';

interface InstallCommandDisplayProps {
  installCommand: { command: string; description: string };
  copiedCommand: boolean;
  onCopy: () => Promise<void>;
  onRunInTerminal: () => Promise<void>;
}

export function InstallCommandDisplay({
  installCommand,
  copiedCommand,
  onCopy,
  onRunInTerminal,
}: InstallCommandDisplayProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-foreground">{installCommand.description}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              'hover:bg-muted transition-colors',
              copiedCommand ? 'text-status-success' : 'text-muted-foreground hover:text-foreground'
            )}
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
          </button>
        </div>
      </div>
      <div className="p-3 rounded-lg bg-muted font-mono text-xs text-foreground overflow-x-auto">
        {installCommand.command}
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-muted-foreground">
          Click the button to open a terminal with this command.
        </p>
        <button
          type="button"
          onClick={onRunInTerminal}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'bg-primary text-primary-foreground',
            'hover:bg-primary/90 transition-colors'
          )}
        >
          <Play className="w-3.5 h-3.5" />
          Run in Terminal
        </button>
      </div>
    </div>
  );
}
