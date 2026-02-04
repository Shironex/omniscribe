import { useMemo } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Terminal, Plus, AlertCircle } from 'lucide-react';
import { useSessionStore } from '@/stores';
import { useWorkspaceStore, selectActiveTab } from '@/stores';
import { StatusDot } from '@/components/shared/StatusLegend';
import { mapSessionStatus } from '@omniscribe/shared';

interface SessionsSectionProps {
  className?: string;
  onSessionClick?: (sessionId: string) => void;
  onNewSession?: () => void;
}

export function SessionsSection({
  className,
  onSessionClick,
  onNewSession,
}: SessionsSectionProps) {
  const activeTab = useWorkspaceStore(selectActiveTab);

  // Get stable references from stores - avoid selectors that create new arrays
  const allSessions = useSessionStore((state) => state.sessions);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);

  // Memoize filtered sessions to avoid creating new arrays on every render
  const sessions = useMemo(() => {
    if (activeTab?.projectPath) {
      return allSessions.filter((session) => session.projectPath === activeTab.projectPath);
    }
    return allSessions;
  }, [allSessions, activeTab?.projectPath]);

  // Note: Listeners are initialized centrally in useAppInitialization

  // Memoize derived counts to avoid recalculation on every render
  const { sessionCount, activeCount } = useMemo(() => ({
    sessionCount: sessions.length,
    activeCount: sessions.filter(
      (s) => s.status === 'active' || s.status === 'thinking' || s.status === 'executing'
    ).length,
  }), [sessions]);

  return (
    <div className={twMerge(clsx('space-y-2', className))}>
      {/* Header with count and new button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-foreground-secondary">
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
              'hover:bg-muted',
              'text-muted-foreground hover:text-foreground-secondary'
            )}
            title="New Session"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-xs text-muted-foreground animate-pulse py-2">
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
        <div className="text-xs text-muted-foreground py-2">
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
                'hover:bg-muted',
                'focus:outline-none focus:ring-1 focus:ring-primary'
              )}
            >
              <StatusDot status={mapSessionStatus(session.status)} />
              <Terminal size={12} className="text-muted-foreground flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-foreground-secondary truncate">
                  {session.name}
                </div>
                {session.statusMessage && (
                  <div className="text-xs text-muted-foreground truncate">
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
