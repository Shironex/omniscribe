import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { emitAsync } from '@/lib/socketHelpers';
import { formatRelativeTime } from '@/lib/date-utils';
import {
  GithubEvents,
  type Issue,
  type GithubListIssuesPayload,
  type GithubIssuesResponse,
} from '@omniscribe/shared';

interface IssuePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  selectedIssueNumber?: number;
  onSelectIssue: (issue: Issue) => void;
}

export function IssuePickerDialog({
  open,
  onOpenChange,
  projectPath,
  selectedIssueNumber,
  onSelectIssue,
}: IssuePickerDialogProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedPathRef = useRef<string | null>(null);

  const fetchIssues = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await emitAsync<GithubListIssuesPayload, GithubIssuesResponse>(
        GithubEvents.ISSUES,
        { projectPath, state: 'open', limit: 50 }
      );
      if (response.error) {
        setError(response.error);
        setIssues([]);
      } else {
        setIssues(response.issues);
      }
      fetchedPathRef.current = projectPath;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch issues');
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  // Map for O(1) lookups in cmdk filter (avoids O(n) find per keystroke)
  const issuesMap = useMemo(
    () => new Map(issues.map(issue => [String(issue.number), issue])),
    [issues]
  );

  // Fetch issues when dialog opens (or when project changes while open)
  useEffect(() => {
    if (open && fetchedPathRef.current !== projectPath) {
      fetchIssues();
    }
    if (!open) {
      fetchedPathRef.current = null;
    }
  }, [open, projectPath, fetchIssues]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-xs" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
            'w-full max-w-md mx-4',
            'bg-background rounded-2xl shadow-2xl',
            'border border-border',
            'flex flex-col max-h-[70vh]',
            'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'
          )}
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <DialogTitle className="text-base font-semibold text-foreground">
              Attach GitHub Issue
            </DialogTitle>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close">
                <X className="w-4 h-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 px-2 pb-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading issues...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-4">
                <AlertCircle className="w-5 h-5 mb-2 text-destructive" />
                <p className="text-sm text-center">{error}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={fetchIssues}>
                  Retry
                </Button>
              </div>
            ) : (
              <Command
                filter={(value, search) => {
                  const issue = issuesMap.get(value);
                  if (!issue) return 0;
                  const text =
                    `#${issue.number} ${issue.title} ${issue.labels.map(l => l.name).join(' ')}`.toLowerCase();
                  return text.includes(search.toLowerCase()) ? 1 : 0;
                }}
              >
                <CommandInput placeholder="Search issues..." />
                <CommandList className="max-h-[45vh]">
                  <CommandEmpty>No issues found.</CommandEmpty>
                  <CommandGroup>
                    {issues.map(issue => (
                      <CommandItem
                        key={issue.number}
                        value={String(issue.number)}
                        onSelect={() => onSelectIssue(issue)}
                        className="flex items-start gap-2 py-2.5 px-3 cursor-pointer"
                      >
                        {/* Check indicator */}
                        <div className="w-4 h-4 mt-0.5 shrink-0 flex items-center justify-center">
                          {selectedIssueNumber === issue.number && (
                            <Check className="w-4 h-4 text-primary" />
                          )}
                        </div>

                        {/* Issue content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground font-mono shrink-0">
                              #{issue.number}
                            </span>
                            <span className="text-sm truncate">{issue.title}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {/* Labels */}
                            {issue.labels.slice(0, 3).map(label => (
                              <span
                                key={label.name}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium border border-border bg-muted"
                                style={
                                  label.color
                                    ? {
                                        backgroundColor: `#${label.color}20`,
                                        borderColor: `#${label.color}40`,
                                        color: `#${label.color}`,
                                      }
                                    : undefined
                                }
                              >
                                {label.name}
                              </span>
                            ))}
                            {issue.labels.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{issue.labels.length - 3}
                              </span>
                            )}
                            {/* Meta */}
                            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                              {issue.author.login} &middot;{' '}
                              {formatRelativeTime(new Date(issue.createdAt))}
                            </span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
