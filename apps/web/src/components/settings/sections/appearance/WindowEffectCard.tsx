import { Sparkles } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';

/**
 * Native window effect card — vibrancy (macOS) / acrylic (Windows 11)
 * toggle with translucent theme support.
 *
 * Scaffold: implemented in WS1b (native window blur lane).
 */
export function WindowEffectCard() {
  return (
    <SettingsCard
      icon={Sparkles}
      tone="muted"
      title="Window blur"
      subtitle="Let the desktop shine through with a native blur effect."
    >
      <p className="text-xs text-muted-foreground">Coming soon.</p>
    </SettingsCard>
  );
}
