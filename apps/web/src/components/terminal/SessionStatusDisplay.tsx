import { clsx } from 'clsx';
import { Terminal, GitBranch, ArrowUp, ArrowDown, FolderGit2, ShieldOff } from 'lucide-react';
import { type ComponentType } from 'react';
import { StatusDot } from '@/components/shared/StatusLegend';
import { ClaudeIcon } from '@/components/shared/ClaudeIcon';
import type { AIMode, TerminalSession, GitBranchInfo } from './TerminalHeader';

interface AIModeConfigItem {
  icon: ComponentType<{ size?: string | number; className?: string }>;
  label: string;
  color: string;
}

export const aiModeConfig: Record<AIMode, AIModeConfigItem> = {
  claude: { icon: ClaudeIcon, label: 'Claude', color: 'text-orange-400' },
  plain: { icon: Terminal, label: 'Plain', color: 'text-muted-foreground' },
};

interface SessionStatusDisplayProps {
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
}

export function SessionStatusDisplay({ session, gitBranch }: SessionStatusDisplayProps) {
  const modeConfig = aiModeConfig[session.aiMode];
  const ModeIcon = modeConfig.icon;

  const branchName = gitBranch?.name ?? session.branch;
  const ahead = gitBranch?.ahead;
  const behind = gitBranch?.behind;

  return (
    <>
      {/* Status dot */}
      <div data-testid={`session-status-${session.id}`} className="flex items-center shrink-0">
        <StatusDot status={session.status} className="w-2 h-2" />
      </div>

      {/* AI Mode icon + Session label */}
      <div className="flex items-center gap-1 shrink-0">
        <ModeIcon size={14} className={clsx('shrink-0', modeConfig.color)} />
        <span className="text-xs font-medium text-foreground">
          {modeConfig.label} #{session.sessionNumber}
        </span>
      </div>

      {/* Git branch with ahead/behind indicators */}
      {branchName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-card/50">
          <GitBranch size={11} className="text-muted-foreground" />
          <span className="truncate max-w-24">{branchName}</span>
          {ahead !== undefined && ahead > 0 && (
            <span className="flex items-center gap-0.5 text-green-500 text-2xs">
              <ArrowUp size={9} />
              {ahead}
            </span>
          )}
          {behind !== undefined && behind > 0 && (
            <span className="flex items-center gap-0.5 text-orange-500 text-2xs">
              <ArrowDown size={9} />
              {behind}
            </span>
          )}
        </div>
      )}

      {/* Worktree indicator */}
      {session.worktreePath && (
        <div
          className="flex items-center gap-1 text-xs text-cyan-500 shrink-0 px-1.5 py-0.5 rounded bg-cyan-500/10"
          title={session.worktreePath}
        >
          <FolderGit2 size={11} />
          <span>worktree</span>
        </div>
      )}

      {/* Skip-permissions indicator */}
      {session.skipPermissions && (
        <div
          className="flex items-center gap-1 text-xs text-amber-400 shrink-0 px-1.5 py-0.5 rounded bg-amber-500/10"
          title="Running with skip-permissions mode"
          role="status"
          aria-label="Running with skip-permissions mode"
        >
          <ShieldOff size={11} aria-hidden="true" />
          <span className="sr-only">Skip-permissions enabled</span>
        </div>
      )}

      {/* Status message */}
      {session.statusMessage && (
        <span className="text-2xs text-muted-foreground truncate px-1.5 py-0.5 rounded bg-card/30 max-w-[200px]">
          {session.statusMessage}
        </span>
      )}
    </>
  );
}
