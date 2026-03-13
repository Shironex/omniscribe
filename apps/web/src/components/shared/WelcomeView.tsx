import { cn } from '@/lib/utils';
import { FolderOpen, Clock, Sparkles } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { APP_NAME } from '@omniscribe/shared';
import { getGreeting, formatRelativeTime } from '@/lib/date-utils';
import { truncatePath } from '@/lib/path-utils';
import { Button } from '@/components/ui/button';
import { motion } from 'motion/react';
import { IS_MAC } from '@/lib/platform';
import { transitions } from '@/lib/animations';
import { useWorkspaceStore, selectTabs } from '@/stores/useWorkspaceStore';

interface WelcomeViewProps {
  onOpenProject: () => void;
  onSelectProject: (tabId: string) => void;
  className?: string;
}

export function WelcomeView({ onOpenProject, onSelectProject, className }: WelcomeViewProps) {
  const greeting = useMemo(() => getGreeting(), []);
  const workspaceTabs = useWorkspaceStore(selectTabs);
  const recentProjects = useMemo(
    () =>
      [...workspaceTabs].sort((a, b) => b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime()),
    [workspaceTabs]
  );
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
      className={cn(
        'flex flex-col items-center justify-center h-full w-full',
        'bg-background relative overflow-hidden',
        className
      )}
    >
      {/* Main content */}
      <motion.div
        className="relative flex flex-col items-center max-w-2xl w-full px-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transitions.spring}
      >
        {/* Hero section */}
        <div
          className={cn(
            'flex flex-col items-center',
            'px-12 py-10 rounded-2xl mb-8',
            'bg-card',
            'border border-border',
            'shadow-sm'
          )}
        >
          {/* Greeting */}
          <p className="text-sm text-foreground-secondary mb-4">{greeting}</p>

          {/* Logo/Icon */}
          <div className="mb-6">
            <div
              className={cn(
                'w-20 h-20 rounded-full',
                'bg-primary/10',
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
                <Button
                  key={project.id}
                  variant="outline"
                  onClick={() => onSelectProject(project.id)}
                  className={cn(
                    'w-full justify-start h-auto px-4 py-3',
                    'bg-card',
                    'border-border/60',
                    'hover:bg-accent hover:border-border',
                    'transition-colors duration-200',
                    'group'
                  )}
                >
                  <div
                    className={cn(
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
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Open Project Action */}
        <Button
          variant="default"
          onClick={onOpenProject}
          className="gap-3 px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <FolderOpen size={20} />
          <span>Open Project</span>
        </Button>

        {/* Keyboard hint */}
        <p className="mt-4 text-xs text-muted-foreground">
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-foreground-secondary">
            {IS_MAC ? '\u2318' : 'Ctrl'}+O
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
      </motion.div>
    </div>
  );
}
