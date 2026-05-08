import { GitPullRequest, GitBranch, CheckCircle2, Lock } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';

/**
 * Fake PR card mirroring the user's `gh auth` state. When signed in, it
 * shows the authenticated username, an open-PR style card, and a green
 * "Mergeable" check. When signed out, the card collapses to a locked
 * placeholder telling the user what they'd see once authenticated.
 */
export function GithubPreview() {
  const status = useSettingsStore(state => state.githubCliStatus);
  const authed = Boolean(status?.auth.authenticated);
  const username = status?.auth.username ?? 'octocat';

  if (!authed) {
    return (
      <div className="rounded-lg border border-dashed border-border-glass bg-background/40 p-4 flex items-center gap-3">
        <div className="size-9 rounded-lg border border-border-glass bg-muted/30 grid place-items-center shrink-0">
          <Lock className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Not connected</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Sign in with{' '}
            <code className="rounded bg-muted/50 px-1 py-0.5 text-[10px]">gh auth login</code> to
            see PRs and reviews here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-3.5">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-full bg-gradient-to-br from-primary/40 to-primary/10 border border-primary/30 grid place-items-center shrink-0 text-[11px] font-semibold text-primary uppercase">
          {username.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GitPullRequest className="w-3.5 h-3.5 text-status-success shrink-0" />
            <span className="text-[13px] font-semibold text-foreground truncate">
              Add settings previews
            </span>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums">
              #{42}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono text-foreground/80">@{username}</span>
            <span>wants to merge</span>
            <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">
              <GitBranch className="w-3 h-3" />
              feat/previews
            </span>
            <span>→</span>
            <span className="inline-flex items-center gap-1 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px]">
              <GitBranch className="w-3 h-3" />
              master
            </span>
          </div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-status-success/30 bg-status-success-bg/40 px-2 py-0.5 text-[11px] text-status-success">
            <CheckCircle2 className="w-3 h-3" />
            Mergeable
          </div>
        </div>
      </div>
    </div>
  );
}
