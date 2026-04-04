import '../global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';

const siteUrl = 'https://omniscribe.dev';

export const metadata: Metadata = {
  title: {
    template: '%s | Omniscribe',
    default: 'Omniscribe - Multi-Session AI Coding Assistant',
  },
  description:
    'Orchestrate multiple AI coding sessions in parallel. A desktop app for managing Claude Code, Codex, and other AI assistants with a multi-session grid, plugin system, and more.',
  keywords: [
    'AI coding assistant',
    'Claude Code',
    'Codex',
    'Electron',
    'desktop app',
    'multi-session',
    'plugin system',
    'Omniscribe',
  ],
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    siteName: 'Omniscribe',
    title: 'Omniscribe - Multi-Session AI Coding Assistant',
    description:
      'Orchestrate multiple AI coding sessions in parallel. A desktop app for managing Claude Code, Codex, and other AI assistants.',
    url: siteUrl,
    images: [{ url: '/app.png', width: 1200, height: 630, alt: 'Omniscribe App Screenshot' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Omniscribe - Multi-Session AI Coding Assistant',
    description:
      'Orchestrate multiple AI coding sessions in parallel. A desktop app for managing Claude Code, Codex, and other AI assistants.',
  },
  metadataBase: new URL(siteUrl),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
