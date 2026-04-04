import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { Highlights } from '@/components/landing/highlights';
import { CtaSection } from '@/components/landing/cta-section';
import packageJson from '../../package.json';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero version={`v${packageJson.version}`} />
      <Features />
      <Highlights />
      <CtaSection />
    </main>
  );
}
