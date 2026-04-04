'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import type { ReleaseData, PlatformRelease } from './types';

const GITHUB_RELEASES_URL = 'https://github.com/Shironex/omniscribe/releases';

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getFileExtension(name: string): string {
  const parts = name.split('.');
  return parts.pop()?.toUpperCase() ?? '';
}

type DetectedPlatform = 'macos' | 'windows' | null;

function detectPlatform(): DetectedPlatform {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'macos';
  if (ua.includes('win')) return 'windows';
  return null;
}

const platformLabel: Record<string, string> = {
  macos: 'macOS',
  windows: 'Windows',
};

const DownloadIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

const systemRequirements = [
  {
    platform: 'macOS',
    architecture: 'Apple Silicon (arm64)',
    minOS: 'macOS 11+',
  },
  {
    platform: 'Windows',
    architecture: 'x64',
    minOS: 'Windows 10+',
  },
];

/* ── Shimmer Download Button (external <a>) ──────────────────────── */

function ShimmerDownloadButton({
  href,
  children,
  className = '',
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={`group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg bg-violet-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all duration-300 hover:bg-violet-500 hover:shadow-violet-500/30 hover:-translate-y-0.5 ${className}`}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.15) 50%, transparent 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s ease-in-out infinite',
        }}
        aria-hidden="true"
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </a>
  );
}

/* ── Hero Download Section ───────────────────────────────────────── */

function HeroDownload({ platform, release }: { platform: PlatformRelease; release: ReleaseData }) {
  const primaryAsset = platform.assets[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 sm:p-12"
    >
      <div className="flex flex-col items-center text-center">
        <p className="mb-2 text-sm font-medium tracking-wide text-white/30 uppercase">
          {platformLabel[platform.platform] ?? platform.label}
        </p>

        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Download Omniscribe
        </h2>

        <p className="mt-3 text-sm text-white/50">
          {release.version} &middot; {formatDate(release.publishedAt)}
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <ShimmerDownloadButton href={primaryAsset.url}>
            <DownloadIcon />
            Download .{getFileExtension(primaryAsset.name).toLowerCase()}
            <span className="text-white/60">({formatBytes(primaryAsset.size)})</span>
          </ShimmerDownloadButton>
        </div>

        {platform.assets.length > 1 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {platform.assets.slice(1).map(asset => (
              <a
                key={asset.name}
                href={asset.url}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.05] px-5 py-2.5 text-sm text-white/50 transition-colors hover:border-white/[0.2] hover:text-white/70"
              >
                <DownloadIcon />.{getFileExtension(asset.name).toLowerCase()}
                <span className="text-xs text-white/30">{formatBytes(asset.size)}</span>
              </a>
            ))}
          </div>
        )}

        <p className="mt-8 max-w-md text-xs leading-relaxed text-white/30">{platform.note}</p>
      </div>
    </motion.div>
  );
}

/* ── Compact Platform Card ───────────────────────────────────────── */

function CompactPlatformCard({ platform, index }: { platform: PlatformRelease; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.3,
        ease: 'easeOut',
        delay: 0.1 + index * 0.1,
      }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-colors hover:border-white/[0.1]"
    >
      <h3 className="text-base font-semibold text-white">{platform.label}</h3>

      <div className="mt-5 space-y-2">
        {platform.assets.map(asset => (
          <a
            key={asset.name}
            href={asset.url}
            className="flex items-center justify-between rounded-lg border border-white/[0.1] bg-white/[0.05] px-4 py-2.5 text-sm transition-colors hover:border-white/[0.2] hover:bg-white/[0.08]"
          >
            <span className="flex items-center gap-2 text-white/70">
              <DownloadIcon />.{getFileExtension(asset.name).toLowerCase()}
            </span>
            <span className="text-xs text-white/30">{formatBytes(asset.size)}</span>
          </a>
        ))}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-white/30">{platform.note}</p>
    </motion.div>
  );
}

/* ── Fallback ────────────────────────────────────────────────────── */

function Fallback() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="mx-auto max-w-xl rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 text-center"
    >
      <h3 className="mb-2 text-lg font-semibold text-white">Unable to load release data</h3>
      <p className="mb-6 text-sm text-white/50">
        We couldn&apos;t fetch the latest release information. You can download directly from
        GitHub.
      </p>
      <ShimmerDownloadButton href={GITHUB_RELEASES_URL}>View on GitHub</ShimmerDownloadButton>
    </motion.div>
  );
}

/* ── Main Component ──────────────────────────────────────────────── */

export function PlatformCards({ release }: { release: ReleaseData | null }) {
  const [detected, setDetected] = useState<DetectedPlatform>(null);

  useEffect(() => {
    setDetected(detectPlatform());
  }, []);

  const detectedPlatform = release?.platforms.find(p => p.platform === detected);
  const otherPlatforms = release?.platforms.filter(p => p.platform !== detected) ?? [];

  return (
    <section className="relative py-20 sm:py-28">
      <div className="relative mx-auto max-w-3xl px-6">
        {!release ? (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="mb-10 text-center"
            >
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Download Omniscribe
              </h1>
              <p className="mt-3 text-sm text-white/50">Get the latest version for your platform</p>
            </motion.div>
            <Fallback />
          </>
        ) : (
          <>
            {/* Hero: detected platform */}
            {detectedPlatform && <HeroDownload platform={detectedPlatform} release={release} />}

            {/* Other platforms */}
            {otherPlatforms.length > 0 && (
              <div className={detectedPlatform ? 'mt-14' : ''}>
                <motion.h2
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
                  className="mb-5 text-sm font-medium text-white/30"
                >
                  {detectedPlatform ? 'Other platforms' : 'Available platforms'}
                </motion.h2>
                <div
                  className={`grid gap-4 ${
                    otherPlatforms.length === 1
                      ? 'grid-cols-1'
                      : otherPlatforms.length === 2
                        ? 'grid-cols-1 sm:grid-cols-2'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  {otherPlatforms.map((platform, i) => (
                    <CompactPlatformCard key={platform.platform} platform={platform} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* System Requirements */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4, ease: 'easeOut' }}
              className="mt-14"
            >
              <h2 className="mb-5 text-sm font-medium text-white/30">System requirements</h2>
              <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-6 py-3.5 text-left text-xs font-medium text-white/30">
                        Platform
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-medium text-white/30">
                        Architecture
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-medium text-white/30">
                        Min OS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemRequirements.map(req => (
                      <tr key={req.platform} className="border-b border-white/[0.04] last:border-0">
                        <td className="px-6 py-3 text-white">{req.platform}</td>
                        <td className="px-6 py-3 text-white/50">{req.architecture}</td>
                        <td className="px-6 py-3 text-white/50">{req.minOS}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Footer links */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.5, ease: 'easeOut' }}
              className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-white/30"
            >
              <a
                href={GITHUB_RELEASES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-white/60 hover:underline"
              >
                Looking for older versions?
              </a>
              <span className="hidden text-white/[0.1] sm:inline">|</span>
              <Link
                href="/docs/contributing/quickstart"
                className="transition-colors hover:text-white/60 hover:underline"
              >
                Want to build from source?
              </Link>
            </motion.div>
          </>
        )}
      </div>
    </section>
  );
}
