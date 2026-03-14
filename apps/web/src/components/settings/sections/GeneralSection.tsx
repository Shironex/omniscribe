import { Info } from 'lucide-react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { AboutCard } from './AboutCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { UpdatesCard } from './UpdatesCard';

export function GeneralSection() {
  return (
    <div className="space-y-6">
      <SectionHeader icon={Info} title="About" description="Application information" />

      <AboutCard />
      <DiagnosticsCard />
      <UpdatesCard />
    </div>
  );
}
