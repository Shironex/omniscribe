import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';
import { Highlights } from '@/components/landing/highlights';
import { CtaSection } from '@/components/landing/cta-section';

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <Hero />
      <Features />
      <Highlights />
      <CtaSection />
    </main>
  );
}
