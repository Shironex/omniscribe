import { APP_NAME } from '@omniscribe/shared';
import { useAppVersion } from '@/hooks/useAppVersion';

export function AboutCard() {
  const version = useAppVersion();

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-6">
      <div className="text-center space-y-3">
        <div className="text-xl font-bold text-foreground">{APP_NAME}</div>
        {version && <div className="text-sm font-mono text-primary">v{version}</div>}
        <div className="text-sm text-muted-foreground">AI-powered development workspace</div>
      </div>
    </div>
  );
}
