import { Image } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';

/**
 * Background ("blend") settings card — image picker, opacity and blur
 * controls for the translucent background overlay.
 *
 * Scaffold: implemented in WS1a (bg blend layer lane).
 */
export function BackgroundCard() {
  return (
    <SettingsCard
      icon={Image}
      tone="blue"
      title="Background"
      subtitle="Blend a custom image behind the workspace."
    >
      <p className="text-xs text-muted-foreground">Coming soon.</p>
    </SettingsCard>
  );
}
