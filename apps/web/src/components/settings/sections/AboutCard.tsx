import { APP_NAME } from '@omniscribe/shared';
import { useAppVersion } from '@/hooks/useAppVersion';
import { SettingsCard } from '@/components/settings/SettingsCard';

export function AboutCard() {
  const version = useAppVersion();

  return (
    <SettingsCard>
      <div className="text-center space-y-3 py-2">
        <div className="text-xl font-bold text-foreground">{APP_NAME}</div>
        {version && <div className="text-sm font-mono text-primary">v{version}</div>}
        <div className="text-sm text-muted-foreground">AI-powered development workspace</div>
      </div>
    </SettingsCard>
  );
}
