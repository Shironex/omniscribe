import { CheckCircle2, XCircle, Shield } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { StatusPill } from '@/components/shared/StatusPill';

interface ClaudeAuthCardProps {
  authenticated: boolean;
}

export function ClaudeAuthCard({ authenticated }: ClaudeAuthCardProps) {
  return (
    <SettingsCard
      icon={Shield}
      tone={authenticated ? 'green' : 'destructive'}
      title="Authentication"
      subtitle="OAuth sign-in status"
      headerAccessory={
        authenticated ? (
          <StatusPill tone="ready" icon={CheckCircle2}>
            Signed In
          </StatusPill>
        ) : (
          <StatusPill tone="warning" icon={XCircle}>
            Not Signed In
          </StatusPill>
        )
      }
    >
      {!authenticated ? (
        <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <p>You need to sign in to use Claude CLI.</p>
          <p className="mt-2">
            Run{' '}
            <code className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs">claude login</code>{' '}
            in your terminal to authenticate.
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-primary/10 text-sm text-primary">
          OAuth token found. You're ready to use Claude CLI.
        </div>
      )}
    </SettingsCard>
  );
}
