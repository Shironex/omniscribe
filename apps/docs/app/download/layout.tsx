import type { ReactNode } from 'react';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { layoutOptions } from '@/lib/layout.shared';
import { Footer } from '@/components/footer';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <HomeLayout {...layoutOptions}>
      {children}
      <Footer />
    </HomeLayout>
  );
}
