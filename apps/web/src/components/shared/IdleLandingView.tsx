import { cn } from '@/lib/utils';
import { Plus, Layers, GitBranch, MessageSquare, TerminalSquare, Sparkles } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { motion, useReducedMotion } from 'motion/react';
import { transitions } from '@/lib/animations';
import { useSessionHistoryStore } from '@/stores/useSessionHistoryStore';
import { resumeSession, continueLastSession } from '@/lib/session';
import { extractErrorMessage } from '@omniscribe/shared';
import { useSessionStore } from '@/stores/useSessionStore';
import { IS_MAC } from '@/lib/platform';
import { toast } from 'sonner';

interface IdleLandingViewProps {
  projectPath: string | null;
  onAddSession: () => void;
  onOpenLaunchModal?: () => void;
  className?: string;
}

export function IdleLandingView({
  projectPath,
  onAddSession,
  onOpenLaunchModal,
  className,
}: IdleLandingViewProps) {
  const reduceMotion = useReducedMotion();

  const sessions = useSessionHistoryStore(state => state.sessions);
  const isLoading = useSessionHistoryStore(state => state.isLoading);
  const error = useSessionHistoryStore(state => state.error);
  const fetchHistory = useSessionHistoryStore(state => state.fetchHistory);
  const updateSession = useSessionStore(state => state.updateSession);

  useEffect(() => {
    if (projectPath) {
      fetchHistory(projectPath);
    }
  }, [projectPath, fetchHistory]);

  const handleResumeLast = async () => {
    if (!projectPath || sessions.length === 0) return;
    try {
      const session = await continueLastSession(projectPath);
      if (session.terminalSessionId !== undefined) {
        updateSession(session.id, { terminalSessionId: session.terminalSessionId });
      }
      toast.success('Continuing last session');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to continue last session'));
    }
  };

  const handleResumeEntry = async (entry: {
    sessionId: string;
    projectPath: string;
    gitBranch: string;
    summary: string;
    firstPrompt: string;
    customTitle?: string;
  }) => {
    if (!projectPath) return;
    try {
      const session = await resumeSession(
        entry.sessionId,
        projectPath,
        entry.gitBranch,
        entry.customTitle || entry.summary || entry.firstPrompt?.slice(0, 50)
      );
      if (session.terminalSessionId !== undefined) {
        updateSession(session.id, { terminalSessionId: session.terminalSessionId });
      }
      toast.success('Session resumed successfully');
    } catch (err) {
      toast.error(extractErrorMessage(err, 'Failed to resume session'));
    }
  };

  const recentSessions = sessions.slice(0, 3);
  const hasRecent = isLoading || error || recentSessions.length > 0;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'bg-background relative overflow-hidden',
        className
      )}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, var(--glow-1, transparent) 0%, transparent 55%)',
        }}
      />

      <motion.div
        className="relative flex flex-col items-center w-full max-w-[560px] px-6"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduceMotion ? { duration: 0 } : transitions.spring}
      >
        <IdleHero onAddSession={onAddSession} onOpenLaunchModal={onOpenLaunchModal} />

        {hasRecent && (
          <IdleRecentPanel
            sessions={recentSessions}
            isLoading={isLoading}
            error={error}
            projectPath={projectPath}
            onResumeLast={handleResumeLast}
            onResumeEntry={handleResumeEntry}
            onRetry={() => projectPath && fetchHistory(projectPath)}
          />
        )}
      </motion.div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface IdleHeroProps {
  onAddSession: () => void;
  onOpenLaunchModal?: () => void;
}

function IdleHero({ onAddSession, onOpenLaunchModal }: IdleHeroProps) {
  return (
    <>
      <IdleIconCluster />

      <p className="text-2xs uppercase tracking-[0.18em] font-mono text-muted-foreground mb-3">
        No active sessions
      </p>

      <h2 className="text-3xl font-semibold tracking-tight text-foreground text-center mb-3">
        Orchestrate a fleet of agents.
      </h2>

      <p className="text-sm text-muted-foreground text-center max-w-[440px] mb-7 leading-relaxed">
        Run Claude Code, Codex, and plain shells side by side — on the same branch or on parallel
        worktrees.
      </p>

      <div className="flex items-center gap-3 mb-10">
        <Button
          onClick={onOpenLaunchModal ?? onAddSession}
          type="button"
          className="gap-2 px-4 h-10 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          <Layers size={16} />
          Launch a fleet
          <CtaKbd tone="onPrimary">⇧N</CtaKbd>
        </Button>
        <Button
          variant="outline"
          onClick={onAddSession}
          type="button"
          className="gap-2 px-4 h-10 rounded-lg border-border-glass bg-transparent hover:bg-card text-foreground"
        >
          <Plus size={16} />
          New session
          <CtaKbd tone="ghost">N</CtaKbd>
        </Button>
      </div>
    </>
  );
}

function IdleIconCluster() {
  const tileIcons = [TerminalSquare, GitBranch, Layers, Sparkles];
  return (
    <div className="grid grid-cols-2 gap-1.5 mb-7" aria-hidden>
      {tileIcons.map((Icon, i) => (
        <div
          key={i}
          className="flex items-center justify-center h-8 w-8 rounded-md bg-card/50 border border-border-glass/60 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
        >
          <Icon size={14} strokeWidth={1.5} className="text-muted-foreground/40" />
        </div>
      ))}
    </div>
  );
}

function CtaKbd({ children, tone }: { children: ReactNode; tone: 'onPrimary' | 'ghost' }) {
  return (
    <kbd
      className={cn(
        'ml-1 inline-flex items-center px-1.5 h-5 rounded text-2xs font-mono',
        tone === 'onPrimary'
          ? 'bg-black/20 text-primary-foreground/85'
          : 'bg-muted/60 text-muted-foreground border border-border-glass'
      )}
    >
      {children}
    </kbd>
  );
}

interface IdleRecentPanelProps {
  sessions: Array<{
    sessionId: string;
    summary: string;
    firstPrompt: string;
    gitBranch: string;
    messageCount: number;
    projectPath: string;
    customTitle?: string;
  }>;
  isLoading: boolean;
  error: string | null;
  projectPath: string | null;
  onResumeLast: () => void;
  onResumeEntry: (entry: {
    sessionId: string;
    projectPath: string;
    gitBranch: string;
    summary: string;
    firstPrompt: string;
    customTitle?: string;
  }) => void;
  onRetry: () => void;
}

function IdleRecentPanel({
  sessions,
  isLoading,
  error,
  projectPath,
  onResumeLast,
  onResumeEntry,
  onRetry,
}: IdleRecentPanelProps) {
  const modSymbol = IS_MAC ? '⌘' : 'Ctrl';

  return (
    <div className="w-full rounded-xl border border-border-glass bg-card/40 backdrop-blur-sm overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-border-glass/60">
        <span className="text-2xs uppercase tracking-[0.18em] font-mono text-muted-foreground">
          Recent
        </span>
        <button
          type="button"
          onClick={onResumeLast}
          disabled={!projectPath || !sessions.length || isLoading}
          aria-keyshortcuts={`${IS_MAC ? 'Meta' : 'Control'}+Shift+R`}
          className="flex items-center gap-2 text-2xs uppercase tracking-[0.18em] font-mono text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          Resume last
          <kbd className="inline-flex items-center px-1.5 h-5 rounded bg-muted/60 border border-border-glass font-mono text-2xs text-foreground-secondary">
            {modSymbol}⇧R
          </kbd>
        </button>
      </div>

      {/* Body */}
      {error ? (
        <div className="px-4 py-3 text-2xs text-status-warning flex items-center gap-2">
          Couldn't load recent sessions.{' '}
          <button type="button" onClick={onRetry} className="underline hover:no-underline">
            Retry
          </button>
        </div>
      ) : isLoading && sessions.length === 0 ? (
        <ul className="py-1">
          {[0, 1, 2].map(i => (
            <li key={i} className="px-4 py-2.5">
              <div className="h-4 bg-muted/40 rounded animate-pulse w-3/4" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="py-1">
          {sessions.map(entry => {
            const label =
              entry.customTitle || entry.summary || entry.firstPrompt || 'Untitled session';
            return (
              <li key={entry.sessionId}>
                <button
                  type="button"
                  aria-label={`Resume session: ${label}`}
                  onClick={() =>
                    onResumeEntry({
                      sessionId: entry.sessionId,
                      projectPath: projectPath ?? entry.projectPath,
                      gitBranch: entry.gitBranch,
                      summary: entry.summary,
                      firstPrompt: entry.firstPrompt,
                      customTitle: entry.customTitle,
                    })
                  }
                  className="group w-full flex items-center gap-3 px-4 py-2.5 hover:bg-card/70 transition-colors"
                >
                  <span className="text-sm text-foreground truncate flex-1 text-left">{label}</span>
                  {entry.gitBranch && (
                    <span className="flex items-center gap-1 text-2xs font-mono text-muted-foreground shrink-0">
                      <GitBranch size={11} />
                      {entry.gitBranch}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-2xs font-mono text-muted-foreground shrink-0 tabular-nums">
                    <MessageSquare size={11} />
                    {entry.messageCount}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
