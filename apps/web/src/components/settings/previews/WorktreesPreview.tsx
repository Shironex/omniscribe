import { GitBranch, Trash2 } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { DEFAULT_WORKTREE_SETTINGS } from '@omniscribe/shared';
import type { WorktreeSettings } from '@omniscribe/shared';
import { cn } from '@/lib/utils';

/**
 * SVG branch diagram. A trunk labeled `main` forks into two faux worktrees
 * representing what spinning up sessions would create. The `auto-cleanup`
 * toggle shows up as a trash badge on each leaf when enabled, so the user
 * can see at a glance which worktrees would be reaped.
 *
 * Mode `never` collapses the diagram to a single trunk — no forks at all.
 */
const VIEW_W = 320;
const VIEW_H = 132;

export function WorktreesPreview() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const settings: WorktreeSettings = preferences.worktree ?? DEFAULT_WORKTREE_SETTINGS;
  const { mode, autoCleanup } = settings;
  const showForks = mode !== 'never';

  // Trunk + fork geometry.
  const trunkY = 28;
  const forkTopY = 70;
  const forkBotY = 110;
  const trunkX = 40;
  const branchEndX = 240;

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-2">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={VIEW_H}
        role="img"
        aria-label={`Worktree mode ${mode}, auto-cleanup ${autoCleanup ? 'on' : 'off'}`}
      >
        {/* Trunk */}
        <line
          x1={trunkX}
          y1={trunkY}
          x2={branchEndX}
          y2={trunkY}
          stroke="currentColor"
          strokeWidth={2}
          className="text-primary/70"
        />

        {showForks && (
          <>
            {/* Fork curves */}
            <path
              d={`M ${trunkX + 30} ${trunkY} Q ${trunkX + 80} ${trunkY}, ${trunkX + 80} ${forkTopY} L ${branchEndX} ${forkTopY}`}
              stroke="currentColor"
              strokeWidth={1.5}
              fill="none"
              className="text-status-success/80"
            />
            <path
              d={`M ${trunkX + 60} ${trunkY} Q ${trunkX + 110} ${trunkY}, ${trunkX + 110} ${forkBotY} L ${branchEndX} ${forkBotY}`}
              stroke="currentColor"
              strokeWidth={1.5}
              fill="none"
              className="text-status-success/60"
            />
          </>
        )}

        {/* Trunk node */}
        <circle cx={trunkX} cy={trunkY} r={5} className="fill-primary stroke-primary" />
        <circle cx={branchEndX} cy={trunkY} r={4} className="fill-primary/60 stroke-primary/80" />

        {/* Fork nodes */}
        {showForks && (
          <>
            <circle
              cx={branchEndX}
              cy={forkTopY}
              r={4}
              className="fill-status-success/80 stroke-status-success"
            />
            <circle
              cx={branchEndX}
              cy={forkBotY}
              r={4}
              className="fill-status-success/60 stroke-status-success/80"
            />
          </>
        )}
      </svg>

      {/* Labels overlay using flex so we can mix lucide icons & text easily */}
      <div className="-mt-[124px] mb-[8px] px-2 pointer-events-none select-none">
        <div
          className="flex items-center gap-1.5 text-[11px] font-mono text-primary"
          style={{ height: 16 }}
        >
          <GitBranch className="w-3 h-3" />
          <span>main</span>
        </div>
        {showForks && (
          <>
            <div
              className="flex items-center gap-1.5 text-[11px] font-mono text-status-success"
              style={{ marginTop: 26, paddingLeft: 130 }}
            >
              <GitBranch className="w-3 h-3" />
              <span>worktree-1</span>
              {autoCleanup && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider',
                    'bg-status-warning-bg text-status-warning border border-status-warning/30'
                  )}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  auto
                </span>
              )}
            </div>
            <div
              className="flex items-center gap-1.5 text-[11px] font-mono text-status-success/80"
              style={{ marginTop: 22, paddingLeft: 130 }}
            >
              <GitBranch className="w-3 h-3" />
              <span>worktree-2</span>
              {autoCleanup && (
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] uppercase tracking-wider',
                    'bg-status-warning-bg text-status-warning border border-status-warning/30'
                  )}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  auto
                </span>
              )}
            </div>
          </>
        )}
        {!showForks && (
          <div
            className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground"
            style={{ marginTop: 60 }}
          >
            Worktrees disabled — sessions run in main directory
          </div>
        )}
      </div>
    </div>
  );
}
