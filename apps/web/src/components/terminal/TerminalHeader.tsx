import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Bot, Sparkles, X, Settings, GitBranch } from 'lucide-react';
import { SessionStatus, StatusDot } from '../shared/StatusLegend';

export type AIMode = 'claude' | 'gemini' | 'codex' | 'plain';

export interface TerminalSession {
  id: string;
  sessionNumber: number;
  aiMode: AIMode;
  status: SessionStatus;
  branch?: string;
  statusMessage?: string;
  /** Terminal PTY session ID - required for the terminal to connect */
  terminalSessionId?: number;
}

interface TerminalHeaderProps {
  session: TerminalSession;
  onSettingsClick?: () => void;
  onClose: () => void;
  className?: string;
}

const aiModeConfig: Record<AIMode, { icon: typeof Bot; label: string; color: string }> = {
  claude: { icon: Bot, label: 'Claude', color: 'text-orange-400' },
  gemini: { icon: Sparkles, label: 'Gemini', color: 'text-blue-400' },
  codex: { icon: Sparkles, label: 'Codex', color: 'text-green-400' },
  plain: { icon: Bot, label: 'Plain', color: 'text-muted-foreground' },
};

export function TerminalHeader({
  session,
  onSettingsClick,
  onClose,
  className,
}: TerminalHeaderProps) {
  const modeConfig = aiModeConfig[session.aiMode];
  const ModeIcon = modeConfig.icon;

  return (
    <div
      className={twMerge(
        clsx(
          'h-7 bg-muted border-b border-border',
          'flex items-center justify-between px-2 gap-2',
          'select-none',
          className
        )
      )}
    >
      {/* Left section: AI mode + label + status */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* AI Mode icon */}
        <ModeIcon size={14} className={clsx('shrink-0', modeConfig.color)} />

        {/* Session label */}
        <span className="text-xs font-medium text-foreground truncate">
          {modeConfig.label} #{session.sessionNumber}
        </span>

        {/* Status badge */}
        <div className="flex items-center gap-1 shrink-0">
          <StatusDot status={session.status} className="w-1.5 h-1.5" />
        </div>

        {/* Branch display */}
        {session.branch && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <GitBranch size={10} />
            <span className="truncate max-w-20">{session.branch}</span>
          </div>
        )}

        {/* Status message (truncated) */}
        {session.statusMessage && (
          <span className="text-2xs text-muted-foreground truncate">
            {session.statusMessage}
          </span>
        )}
      </div>

      {/* Right section: actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Settings button */}
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className={clsx(
              'p-1 rounded',
              'text-muted-foreground hover:text-foreground',
              'hover:bg-card transition-colors'
            )}
            aria-label="Session settings"
          >
            <Settings size={12} />
          </button>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className={clsx(
            'p-1 rounded',
            'text-muted-foreground hover:text-red-400',
            'hover:bg-red-400/10 transition-colors'
          )}
          aria-label="Close session"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
