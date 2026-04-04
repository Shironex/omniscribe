import type { Metadata } from 'next';
import { PlatformCards } from '@/components/download/platform-cards';
import type { PlatformRelease, ReleaseData } from '@/components/download/types';

export const metadata: Metadata = {
  title: 'Download',
  description: 'Download Omniscribe for macOS and Windows',
};

interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: GitHubAsset[];
}

function categorizePlatform(name: string): 'macos' | 'windows' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.dmg')) return 'macos';
  if (lower.endsWith('.exe')) return 'windows';
  return null;
}

async function fetchRelease(): Promise<ReleaseData | null> {
  try {
    const res = await fetch('https://api.github.com/repos/Shironex/omniscribe/releases/latest', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data: GitHubRelease = await res.json();

    const platformMap: Record<string, PlatformRelease> = {
      macos: {
        platform: 'macos',
        label: 'macOS',
        assets: [],
        note: 'Apple Silicon only. Right-click \u2192 Open on first launch.',
      },
      windows: {
        platform: 'windows',
        label: 'Windows',
        assets: [],
        note: 'x64 architecture. NSIS installer.',
      },
    };

    for (const asset of data.assets) {
      const platform = categorizePlatform(asset.name);
      if (platform) {
        platformMap[platform].assets.push({
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size,
        });
      }
    }

    return {
      version: data.tag_name,
      publishedAt: data.published_at,
      releaseUrl: data.html_url,
      platforms: Object.values(platformMap).filter(p => p.assets.length > 0),
    };
  } catch {
    return null;
  }
}

export default async function DownloadPage() {
  const release = await fetchRelease();

  return (
    <main className="flex flex-1 flex-col">
      <PlatformCards release={release} />
    </main>
  );
}
