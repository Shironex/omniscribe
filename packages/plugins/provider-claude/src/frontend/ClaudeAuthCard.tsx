import { CheckCircle2, XCircle, Shield } from 'lucide-react';

interface ClaudeAuthCardProps {
  authenticated: boolean;
}

export function ClaudeAuthCard({ authenticated }: ClaudeAuthCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
          <Shield className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">Authentication</h3>
          <p className="text-xs text-muted-foreground">OAuth sign-in status</p>
        </div>
        {authenticated ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Signed In
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-status-warning bg-status-warning-bg px-2 py-1 rounded-full">
            <XCircle className="w-3 h-3" />
            Not Signed In
          </span>
        )}
      </div>

      {!authenticated && (
        <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <p>You need to sign in to use Claude CLI.</p>
          <p className="mt-2">
            Run{' '}
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">claude login</code>{' '}
            in your terminal to authenticate.
          </p>
        </div>
      )}

      {authenticated && (
        <div className="p-3 rounded-lg bg-primary/10 text-sm text-primary">
          OAuth token found. You're ready to use Claude CLI.
        </div>
      )}
    </div>
  );
}
