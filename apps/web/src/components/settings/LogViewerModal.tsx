import { useState, useEffect, useRef, useCallback } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  X,
  ChevronLeft,
  ScrollText,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import type { LogEntry } from '@omniscribe/shared';

interface LogFile {
  name: string;
  size: number;
  lastModified: number;
}

interface LogViewerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LEVEL_STYLES: Record<string, string> = {
  error: 'bg-red-500/15 text-red-400 border-red-500/30',
  warn: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  debug: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLogTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${time}.${ms}`;
  } catch {
    return iso;
  }
}

function parseLogContent(raw: string): LogEntry[] {
  const lines = raw.split('\n').filter(Boolean);
  const entries: LogEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as LogEntry);
    } catch {
      // Skip malformed lines
    }
  }
  return entries;
}

function ExpandableData({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const formatted = JSON.stringify(data, null, 2);

  return (
    <button
      type="button"
      onClick={() => setExpanded(!expanded)}
      className="flex items-start gap-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {expanded ? (
        <ChevronDown className="w-3 h-3 mt-0.5 shrink-0" />
      ) : (
        <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
      )}
      {expanded ? (
        <pre className="whitespace-pre-wrap break-all font-mono">{formatted}</pre>
      ) : (
        <span className="truncate max-w-[300px] font-mono">
          {JSON.stringify(data).slice(0, 80)}
          {JSON.stringify(data).length > 80 && '...'}
        </span>
      )}
    </button>
  );
}

const MAX_DISPLAY_ENTRIES = 5000;

export function LogViewerModal({ open, onOpenChange }: LogViewerModalProps) {
  const [files, setFiles] = useState<LogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI?.app?.listLogFiles();
      setFiles(result ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list log files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadLogContent = useCallback(async (fileName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const content = await window.electronAPI?.app?.readLogFile(fileName);
      if (content) {
        const parsed = parseLogContent(content);
        setEntries(parsed.slice(-MAX_DISPLAY_ENTRIES));
      }
      setSelectedFile(fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read log file');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load file list when modal opens
  useEffect(() => {
    if (open) {
      setSelectedFile(null);
      setEntries([]);
      setError(null);
      loadFiles();
    }
  }, [open, loadFiles]);

  // Scroll to bottom when entries load
  useEffect(() => {
    if (entries.length > 0 && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [entries]);

  const handleBack = () => {
    setSelectedFile(null);
    setEntries([]);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-5xl mx-4',
            'bg-background rounded-2xl shadow-2xl',
            'border border-border',
            'flex flex-col max-h-[85vh]',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-2 shrink-0">
            <div className="flex items-center gap-3">
              {selectedFile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  aria-label="Back to file list"
                  className="h-8 w-8"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              )}
              <div>
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {selectedFile ? selectedFile : 'Log Files'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {selectedFile
                    ? `${entries.length} entries`
                    : `${files.length} file${files.length !== 1 ? 's' : ''} found`}
                </p>
              </div>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive py-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* File List */}
            {!isLoading && !error && !selectedFile && (
              <div className="space-y-1">
                {files.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <ScrollText className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No log files found</p>
                  </div>
                ) : (
                  files.map((file, index) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => loadLogContent(file.name)}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-3 rounded-lg text-left',
                        'hover:bg-muted/50 transition-colors',
                        index === 0 && 'ring-1 ring-primary/30 bg-primary/5'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <ScrollText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(file.lastModified)}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-4">
                        {formatFileSize(file.size)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Log Entries */}
            {!isLoading && !error && selectedFile && (
              <div className="space-y-0.5 font-mono text-xs">
                {entries.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="text-sm">No log entries found</p>
                  </div>
                ) : (
                  entries.map((entry, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-2 py-1 px-2 rounded hover:bg-muted/30 group"
                    >
                      <span className="text-muted-foreground shrink-0 w-[85px]">
                        {formatLogTimestamp(entry.timestamp)}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border w-[52px] text-center',
                          LEVEL_STYLES[entry.level] ?? 'bg-muted text-muted-foreground'
                        )}
                      >
                        {entry.level}
                      </span>
                      <span className="shrink-0 text-primary/70 w-[140px] truncate">
                        {entry.context}
                      </span>
                      <span className="text-foreground break-all min-w-0 flex-1">
                        {entry.message}
                        {entry.data != null && (
                          <div className="mt-0.5">
                            <ExpandableData data={entry.data} />
                          </div>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
