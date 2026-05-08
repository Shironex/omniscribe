import { AboutCard } from './AboutCard';
import { DiagnosticsCard } from './DiagnosticsCard';
import { UpdatesCard } from './UpdatesCard';

export function GeneralSection() {
  return (
    <div className="space-y-4">
      <AboutCard />
      <UpdatesCard />
      <DiagnosticsCard />
    </div>
  );
}
