import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { FolderOpen, Clock, Sparkles } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import type { ProjectTab } from '@omniscribe/shared';
import { APP_NAME } from '@omniscribe/shared';

interface WelcomeViewProps {
  recentProjects: ProjectTab[];
  onOpenProject: () => void;
  onSelectProject: (tabId: string) => void;
  className?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function truncatePath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) return path;
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join('/')}`;
}

export function WelcomeView({
  recentProjects,
  onOpenProject,
  onSelectProject,
  className,
}: WelcomeViewProps) {
  const greeting = useMemo(() => getGreeting(), []);
  const hasRecentProjects = recentProjects.length > 0;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd + O to open project
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        onOpenProject();
      }

      // Number keys 1-9 to open recent project
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 9 && num <= recentProjects.length) {
          e.preventDefault();
          onSelectProject(recentProjects[num - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenProject, onSelectProject, recentProjects]);

  return (
    <div
      className={twMerge(
        clsx(
          'flex flex-col items-center justify-center h-full w-full',
          'bg-background relative overflow-hidden',
          className
        )
      )}
    >
      {/* Background gradient blobs for glassmorphism effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/30 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-brand-600/25 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-400/15 rounded-full blur-[100px]" />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center max-w-2xl w-full px-8">
        {/* Hero section */}
        <div
          className={clsx(
            'flex flex-col items-center',
            'px-12 py-10 rounded-2xl mb-8',
            'bg-background/95 backdrop-blur-xl',
            'border border-border',
            'shadow-2xl'
          )}
        >
          {/* Greeting */}
          <p className="text-sm text-foreground-secondary mb-4">{greeting}</p>

          {/* Logo/Icon */}
          <div className="mb-6">
            <div
              className={clsx(
                'w-20 h-20 rounded-full',
                'bg-gradient-to-br from-primary/20 to-brand-600/20',
                'flex items-center justify-center'
              )}
            >
              <Sparkles size={40} className="text-primary" strokeWidth={1.5} />
            </div>
          </div>

          {/* Tagline */}
          <h1 className="text-xl font-semibold text-foreground mb-2">Welcome to {APP_NAME}</h1>
          <p className="text-sm text-foreground-secondary text-center max-w-sm">
            Orchestrate multiple AI coding assistants in parallel
          </p>
        </div>

        {/* Recent Projects Section */}
        {hasRecentProjects && (
          <div className="w-full mb-6">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Clock size={14} className="text-foreground-secondary" />
              <h2 className="text-sm font-medium text-foreground-secondary">Recent Projects</h2>
            </div>
            <div className="space-y-2">
              {recentProjects.slice(0, 5).map((project, index) => (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg',
                    'bg-card/50 backdrop-blur-lg',
                    'border border-border/60',
                    'hover:bg-card/80 hover:border-border',
                    'transition-all duration-200',
                    'text-left group'
                  )}
                >
                  <div
                    className={clsx(
                      'w-8 h-8 rounded-md flex items-center justify-center',
                      'bg-primary/10 text-primary',
                      'group-hover:bg-primary/20 transition-colors'
                    )}
                  >
                    <FolderOpen size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{project.name}</span>
                      <kbd className="hidden group-hover:inline-flex px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px] text-foreground-secondary">
                        {index + 1}
                      </kbd>
                    </div>
                    <span className="text-xs text-foreground-secondary truncate block">
                      {truncatePath(project.projectPath)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(project.lastAccessedAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Open Project Action */}
        <button
          onClick={onOpenProject}
          className={clsx(
            'flex items-center gap-3 px-6 py-3 rounded-xl',
            'bg-gradient-to-r from-primary to-brand-600',
            'text-white font-medium',
            'shadow-lg shadow-primary/25',
            'hover:shadow-xl hover:shadow-primary/30',
            'hover:scale-[1.02] active:scale-[0.98]',
            'transition-all duration-200'
          )}
        >
          <FolderOpen size={20} />
          <span>Open Project</span>
        </button>

        {/* Keyboard hint */}
        <p className="mt-4 text-xs text-muted-foreground">
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-foreground-secondary">
            Ctrl+O
          </kbd>{' '}
          to open a project
          {hasRecentProjects && (
            <>
              {' or '}
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-foreground-secondary">
                1-{Math.min(recentProjects.length, 9)}
              </kbd>{' '}
              for recent
            </>
          )}
        </p>
      </div>
    </div>
  );
}
