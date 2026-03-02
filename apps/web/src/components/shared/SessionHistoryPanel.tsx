import { X, RefreshCw, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { animationVariants, transitions } from '@/lib/animations';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { SessionHistoryFilters } from './SessionHistoryFilters';
import { SessionHistoryItem } from './SessionHistoryItem';
import { useSessionHistory } from '@/hooks/useSessionHistory';
import { useAppUIStore } from '@/stores/useAppUIStore';

interface SessionHistoryPanelProps {
  projectPath: string | null;
  /** Current git branch — passed to continueLastSession */
  currentBranch?: string;
  className?: string;
}

/**
 * Collapsible right sidebar panel that shows Claude Code session history
 * and allows resuming, forking, and searching past sessions.
 */
export function SessionHistoryPanel({
  projectPath,
  currentBranch,
  className,
}: SessionHistoryPanelProps) {
  const isOpen = useAppUIStore(state => state.isHistoryOpen);
  const closeHistory = useAppUIStore(state => state.closeHistory);
  const {
    filteredSessions,
    isLoading,
    error,
    searchText,
    setSearchText,
    selectedBranch,
    setSelectedBranch,
    uniqueBranches,
    sortNewestFirst,
    handleToggleSort,
    handleResume,
    handleFork,
    handleContinueLast,
    handleRefresh,
  } = useSessionHistory({ isOpen, projectPath, currentBranch });

  return (
    <div className={cn('h-full overflow-hidden', className)}>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={transitions.springSmooth}
            className="h-full w-80 border-l border-border bg-muted flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
              <span className="text-xs font-medium text-foreground-secondary uppercase tracking-wide">
                Session History
              </span>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleRefresh}
                      className="h-auto w-auto p-1"
                      aria-label="Refresh session history"
                    >
                      <RefreshCw size={13} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Refresh</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={closeHistory}
                      className="h-auto w-auto p-1"
                      aria-label="Close session history panel"
                    >
                      <X size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Close</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {/* Continue Last Button */}
            <div className="px-3 py-2 border-b border-border shrink-0">
              <Button
                onClick={handleContinueLast}
                disabled={!projectPath}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 h-auto text-xs font-medium bg-status-success/15 text-status-success hover:bg-status-success/25 hover:text-status-success transition-colors"
              >
                <PlayCircle size={13} />
                Continue Last Conversation
              </Button>
            </div>

            {/* Search & Filter Bar */}
            <SessionHistoryFilters
              searchText={searchText}
              onSearchChange={setSearchText}
              selectedBranch={selectedBranch}
              onBranchChange={setSelectedBranch}
              uniqueBranches={uniqueBranches}
              sortNewestFirst={sortNewestFirst}
              onToggleSort={handleToggleSort}
            />

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {isLoading && (
                <div className="text-xs text-muted-foreground animate-pulse py-4 text-center">
                  Loading history...
                </div>
              )}

              {error && <div className="text-xs text-red-400 py-2 px-2">{error}</div>}

              {!isLoading && filteredSessions.length === 0 && !error && (
                <div className="text-xs text-muted-foreground py-8 text-center">
                  {searchText || selectedBranch ? 'No matching sessions' : 'No past sessions'}
                </div>
              )}

              <motion.div
                initial="initial"
                animate="animate"
                transition={{ staggerChildren: 0.03 }}
              >
                {filteredSessions.map(entry => (
                  <motion.div
                    key={entry.sessionId}
                    variants={animationVariants.slideUp}
                    transition={transitions.fast}
                  >
                    <SessionHistoryItem entry={entry} onResume={handleResume} onFork={handleFork} />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
