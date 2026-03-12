import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ComponentType,
} from 'react';
import { cn } from '@/lib/utils';
import {
  Terminal,
  GitBranch,
  ArrowUp,
  ArrowDown,
  FolderGit2,
  ShieldOff,
  RotateCcw,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { StatusDot } from '@/components/shared/StatusLegend';
import { Input } from '@/components/ui/input';
import { useSessionStore } from '@/stores/useSessionStore';
import { usePluginStore, type ProviderInfo } from '@/stores/usePluginStore';
import { MAX_SESSION_NAME_LENGTH } from '@omniscribe/shared';
import type { TerminalSession, GitBranchInfo } from './TerminalHeader';
import type { SessionStatusRendererRegistration, SessionStatusProps } from '@omniscribe/plugin-api';

type WithPluginId<T> = T & { pluginId: string };

/**
 * Resolve mode config dynamically from plugin store providers and status renderers.
 * Returns icon, label, color, and optional renderer component.
 */
function getModeConfig(
  aiMode: string,
  providers: ProviderInfo[],
  statusRenderers: Map<string, WithPluginId<SessionStatusRendererRegistration>>
) {
  if (aiMode === 'plain') {
    return {
      icon: Terminal,
      label: 'Plain',
      color: 'text-muted-foreground',
      rendererComponent: null,
    };
  }

  const renderer = [...statusRenderers.values()].find(r => r.aiMode === aiMode);
  const provider = providers.find(p => p.aiMode === aiMode);

  return {
    icon: Terminal,
    label: provider?.displayName ?? aiMode,
    color: 'text-primary',
    rendererComponent: renderer?.component ?? null,
  };
}

interface SessionStatusDisplayProps {
  session: TerminalSession;
  gitBranch?: GitBranchInfo;
}

export const SessionStatusDisplay = React.memo(function SessionStatusDisplay({
  session,
  gitBranch,
}: SessionStatusDisplayProps) {
  const providers = usePluginStore(useShallow(s => s.providers));
  const statusRenderers = usePluginStore(s => s.statusRenderers);
  const modeConfig = useMemo(
    () => getModeConfig(session.aiMode, providers, statusRenderers),
    [session.aiMode, providers, statusRenderers]
  );
  const ModeIcon = modeConfig.icon;
  const RendererComponent =
    modeConfig.rendererComponent as ComponentType<SessionStatusProps> | null;
  const setCustomTitle = useSessionStore(state => state.setCustomTitle);
  const clearCustomTitle = useSessionStore(state => state.clearCustomTitle);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const defaultTitle = `${modeConfig.label} #${session.sessionNumber}`;
  const displayTitle = session.customTitle ?? defaultTitle;

  const branchName = gitBranch?.name ?? session.branch;
  const ahead = gitBranch?.ahead;
  const behind = gitBranch?.behind;

  const enterEditMode = useCallback(() => {
    setEditValue(displayTitle);
    setIsEditing(true);
  }, [displayTitle]);

  const confirmEdit = useCallback(() => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== defaultTitle) {
      setCustomTitle(session.id, trimmed);
    } else {
      clearCustomTitle(session.id);
    }
    setIsEditing(false);
  }, [editValue, defaultTitle, session.id, setCustomTitle, clearCustomTitle]);

  const cancelEdit = useCallback(() => {
    cancelledRef.current = true;
    setIsEditing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [confirmEdit, cancelEdit]
  );

  // Auto-focus and select all text when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  return (
    <>
      {/* Status dot */}
      <div data-testid={`session-status-${session.id}`} className="flex items-center shrink-0">
        <StatusDot status={session.status} className="w-2 h-2" />
      </div>

      {/* AI Mode icon + Session label */}
      <div className="flex items-center gap-1 shrink-0">
        {RendererComponent ? (
          <RendererComponent
            sessionId={session.id}
            status={session.status}
            statusMessage={session.statusMessage}
          />
        ) : (
          <ModeIcon size={14} className={cn('shrink-0', modeConfig.color)} />
        )}
        {isEditing ? (
          <Input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={confirmEdit}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            onDoubleClick={e => e.stopPropagation()}
            maxLength={MAX_SESSION_NAME_LENGTH}
            className="h-5 min-w-32 max-w-48 px-1 py-0 text-xs font-medium select-text border-primary rounded-sm"
            aria-label="Rename session"
          />
        ) : (
          <span
            className="text-xs font-medium text-foreground cursor-text"
            onDoubleClick={enterEditMode}
          >
            {displayTitle}
          </span>
        )}
      </div>

      {/* Git branch with ahead/behind indicators */}
      {branchName && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-card/50">
          <GitBranch size={11} className="text-muted-foreground" />
          <span className="truncate max-w-24">{branchName}</span>
          {ahead !== undefined && ahead > 0 && (
            <span className="flex items-center gap-0.5 text-status-success text-2xs">
              <ArrowUp size={9} />
              {ahead}
            </span>
          )}
          {behind !== undefined && behind > 0 && (
            <span className="flex items-center gap-0.5 text-status-warning text-2xs">
              <ArrowDown size={9} />
              {behind}
            </span>
          )}
        </div>
      )}

      {/* Worktree indicator */}
      {session.worktreePath && (
        <div
          className="flex items-center gap-1 text-xs text-status-accent shrink-0 px-1.5 py-0.5 rounded bg-status-accent/10"
          title={session.worktreePath}
        >
          <FolderGit2 size={11} />
          <span>worktree</span>
        </div>
      )}

      {/* Skip-permissions indicator */}
      {session.skipPermissions && (
        <div
          className="flex items-center gap-1 text-xs text-status-warning shrink-0 px-1.5 py-0.5 rounded bg-status-warning/10"
          title="Running with skip-permissions mode"
          role="status"
          aria-label="Running with skip-permissions mode"
        >
          <ShieldOff size={11} aria-hidden="true" />
          <span className="sr-only">Skip-permissions enabled</span>
        </div>
      )}

      {/* Resumed session indicator */}
      {session.isResumed && (
        <div
          className="flex items-center gap-1 text-xs text-status-success shrink-0 px-1.5 py-0.5 rounded bg-status-success/10"
          title="Resumed from previous Claude Code session"
          role="status"
          aria-label="Resumed from previous Claude Code session"
        >
          <RotateCcw size={11} aria-hidden="true" />
          <span>Resumed</span>
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
});

SessionStatusDisplay.displayName = 'SessionStatusDisplay';
