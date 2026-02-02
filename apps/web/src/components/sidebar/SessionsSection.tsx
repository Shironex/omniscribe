import { useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Terminal, Plus, AlertCircle } from 'lucide-react';
import { useSessionStore, selectSessionsForProject } from '../../stores';
import { useWorkspaceStore, selectActiveTab } from '../../stores';
import { StatusDot, SessionStatus } from '../shared/StatusLegend';

interface SessionsSectionProps {
  className?: string;
  onSessionClick?: (sessionId: string) => void;
  onNewSession?: () => void;
}

/**
 * Map internal session status to StatusDot status
 */
function mapSessionStatus(status: string): SessionStatus {
  switch (status) {
    case 'connecting':
      return 'starting';
    case 'idle':
    case 'disconnected':
      return 'idle';
    case 'active':
    case 'thinking':
    case 'executing':
      return 'working';
    case 'paused':
      return 'needsInput';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

export function SessionsSection({
  className,
  onSessionClick,
  onNewSession,
}: SessionsSectionProps) {
  const activeTab = useWorkspaceStore(selectActiveTab);
  const sessions = useSessionStore((state) =>
    activeTab?.projectPath
      ? selectSessionsForProject(activeTab.projectPath)(state)
      : state.sessions
  );
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const initListeners = useSessionStore((state) => state.initListeners);

  // Initialize listeners on mount
  useEffect(() => {
    initListeners();
  }, [initListeners]);

  const sessionCount = sessions.length;
  const activeCount = sessions.filter(
    (s) => s.status === 'active' || s.status === 'thinking' || s.status === 'executing'
  ).length;

  return (
    <div className={twMerge(clsx('space-y-2', className))}>
      {/* Header with count and new button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-omniscribe-text-secondary">
            {sessionCount} session{sessionCount !== 1 ? 's' : ''}
          </span>
          {activeCount > 0 && (
            <span className="text-xs text-blue-400">
              ({activeCount} active)
            </span>
          )}
        </div>
        {onNewSession && (
          <button
            onClick={onNewSession}
            className={clsx(
              'p-1 rounded transition-colors',
              'hover:bg-omniscribe-surface',
              'text-omniscribe-text-muted hover:text-omniscribe-text-secondary'
            )}
            title="New Session"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-xs text-omniscribe-text-muted animate-pulse py-2">
          Loading sessions...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 py-2">
          <AlertCircle size={12} />
          <span className="text-xs truncate">{error}</span>
        </div>
      )}

      {/* Sessions list */}
      {!isLoading && sessions.length === 0 && !error && (
        <div className="text-xs text-omniscribe-text-muted py-2">
          No active sessions
        </div>
      )}

      {sessions.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSessionClick?.(session.id)}
              className={clsx(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded',
                'text-left transition-colors',
                'hover:bg-omniscribe-surface',
                'focus:outline-none focus:ring-1 focus:ring-omniscribe-accent-primary'
              )}
            >
              <StatusDot status={mapSessionStatus(session.status)} />
              <Terminal size={12} className="text-omniscribe-text-muted flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-omniscribe-text-secondary truncate">
                  {session.name}
                </div>
                {session.statusMessage && (
                  <div className="text-xs text-omniscribe-text-muted truncate">
                    {session.statusMessage}
                  </div>
                )}
              </div>
              {session.needsInputPrompt && (
                <span className="text-yellow-500 text-xs flex-shrink-0" title="Needs input">
                  !
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
