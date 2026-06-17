import { Eye } from 'lucide-react';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { GeneralPreview } from '@/components/settings/previews/GeneralPreview';
import { AboutCard } from './AboutCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { UpdatesCard } from './UpdatesCard';
import { ProjectFootprintCard } from './general/ProjectFootprintCard';

export function GeneralSection() {
  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Eye}
        tone="blue"
        title="Preview"
        subtitle="App shell with your active project tab highlighted."
      >
        <GeneralPreview />
      </SettingsCard>
      <AboutCard />
      <ProjectFootprintCard />
      <UpdatesCard />
      <DiagnosticsCard />
    </div>
  );
}
