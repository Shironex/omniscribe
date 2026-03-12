import React from 'react';
import { RotateCcw, MessageSquare, GitBranch, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/date-utils';
import type { ClaudeSessionEntry } from '@omniscribe/shared';

interface SessionHistoryItemProps {
  entry: ClaudeSessionEntry;
  onResume: (entry: ClaudeSessionEntry) => void;
  onFork: (entry: ClaudeSessionEntry) => void;
}

export const SessionHistoryItem = React.memo(function SessionHistoryItem({
  entry,
  onResume,
  onFork,
}: SessionHistoryItemProps) {
  return (
    <div className="group px-2 py-2 rounded hover:bg-card transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground-secondary truncate">
            {entry.summary || entry.firstPrompt || 'Untitled session'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            {entry.gitBranch && (
              <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
                <GitBranch size={10} />
                <span className="truncate max-w-24">{entry.gitBranch}</span>
              </span>
            )}
            <span className="flex items-center gap-0.5 text-2xs text-muted-foreground">
              <MessageSquare size={10} />
              {entry.messageCount}
            </span>
            <span className="text-2xs text-muted-foreground">
              {formatRelativeTime(new Date(entry.modified))}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onFork(entry)}
            className="h-auto w-auto p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 text-status-info hover:bg-status-info/10 hover:text-status-info"
            title="Fork this session"
            aria-label="Fork this session"
          >
            <GitFork size={13} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onResume(entry)}
            className="h-auto w-auto p-1 opacity-0 group-hover:opacity-100 focus:opacity-100 text-status-success hover:bg-status-success/10 hover:text-status-success"
            title="Resume this session"
            aria-label="Resume this session"
          >
            <RotateCcw size={13} />
          </Button>
        </div>
      </div>
    </div>
  );
});

SessionHistoryItem.displayName = 'SessionHistoryItem';
