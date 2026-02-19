import { useEffect, useState } from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const GITHUB_API = 'https://api.github.com/repos/Shironex/omniscribe/releases/latest';
const RELEASES_URL = 'https://github.com/Shironex/omniscribe/releases';

interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: Asset[];
}

type Platform = 'mac' | 'win' | 'linux';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'mac';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'win';
  return 'linux';
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface PlatformInfo {
  label: string;
  icon: string;
  assets: { ext: string; label: string }[];
}

const platforms: Record<Platform, PlatformInfo> = {
  mac: {
    label: 'macOS',
    icon: '\uD83C\uDF4E',
    assets: [{ ext: '.dmg', label: 'macOS Installer (.dmg)' }],
  },
  win: {
    label: 'Windows',
    icon: '\uD83E\uDE9F',
    assets: [{ ext: '.exe', label: 'Windows Installer (.exe)' }],
  },
  linux: {
    label: 'Linux',
    icon: '\uD83D\uDC27',
    assets: [
      { ext: '.AppImage', label: 'AppImage' },
      { ext: '.deb', label: 'Debian/Ubuntu (.deb)' },
    ],
  },
};

function findAsset(assets: Asset[], ext: string): Asset | undefined {
  return assets.find(a => a.name.endsWith(ext));
}

function PlatformCard({
  platform,
  info,
  assets,
  isDetected,
}: {
  platform: Platform;
  info: PlatformInfo;
  assets: Asset[];
  isDetected: boolean;
}) {
  return (
    <div className={`download-card ${isDetected ? 'download-card--detected' : ''}`}>
      <div className="download-card__header">
        <span className="download-card__icon">{info.icon}</span>
        <h3>{info.label}</h3>
        {isDetected && <span className="download-card__badge">Your platform</span>}
      </div>
      <div className="download-card__assets">
        {info.assets.map(assetInfo => {
          const asset = findAsset(assets, assetInfo.ext);
          return (
            <div key={assetInfo.ext} className="download-card__asset">
              <span>{assetInfo.label}</span>
              {asset ? (
                <a href={asset.browser_download_url} className="button button--primary button--sm">
                  Download ({formatSize(asset.size)})
                </a>
              ) : (
                <span className="download-card__na">Not available</span>
              )}
            </div>
          );
        })}
      </div>
      {platform === 'mac' && (
        <p className="download-card__note">
          Apple Silicon only. First launch: right-click &gt; Open to bypass Gatekeeper.
        </p>
      )}
      {platform === 'linux' && (
        <p className="download-card__note">
          AppImage: <code>chmod +x</code> then run. Deb: <code>sudo dpkg -i</code>.
        </p>
      )}
    </div>
  );
}

function DownloadContent() {
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState(false);
  const [detectedPlatform] = useState<Platform>(detectPlatform);

  useEffect(() => {
    fetch(GITHUB_API)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then(data => setRelease(data))
      .catch(() => setError(true));
  }, []);

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <h2>Download Omniscribe</h2>
        <p>Could not fetch the latest release. Visit GitHub directly:</p>
        <a className="button button--primary button--lg" href={RELEASES_URL}>
          View Releases on GitHub
        </a>
      </div>
    );
  }

  if (!release) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0' }}>
        <p>Loading latest release...</p>
      </div>
    );
  }

  const orderedPlatforms: Platform[] = [
    detectedPlatform,
    ...(['mac', 'win', 'linux'] as Platform[]).filter(p => p !== detectedPlatform),
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Download Omniscribe</h1>
        <p className="hero__subtitle--styled" style={{ marginBottom: '0.5rem' }}>
          Free and open source. Available for macOS, Windows, and Linux.
        </p>
        <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>
          {release.tag_name} &middot; Released {formatDate(release.published_at)} &middot;{' '}
          <a href={release.html_url}>Release notes</a>
        </p>
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        {orderedPlatforms.map(platform => (
          <div key={platform} className="col col--4" style={{ marginBottom: '1rem' }}>
            <PlatformCard
              platform={platform}
              info={platforms[platform]}
              assets={release.assets}
              isDetected={platform === detectedPlatform}
            />
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem' }}>
        <h3>System Requirements</h3>
        <table className="download-requirements">
          <thead>
            <tr>
              <th>Platform</th>
              <th>Architecture</th>
              <th>Minimum OS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>macOS</td>
              <td>Apple Silicon (arm64)</td>
              <td>macOS 11 (Big Sur)</td>
            </tr>
            <tr>
              <td>Windows</td>
              <td>x64</td>
              <td>Windows 10</td>
            </tr>
            <tr>
              <td>Linux</td>
              <td>x86_64</td>
              <td>Ubuntu 20.04+ or equivalent</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'center', marginTop: '2rem', marginBottom: '1rem' }}>
        <p>
          Looking for older versions or beta releases?{' '}
          <a href={RELEASES_URL}>View all releases on GitHub</a>
        </p>
        <p>
          Want to build from source?{' '}
          <Link to="/docs/contributing/quickstart">See the development setup guide</Link>
        </p>
      </div>
    </div>
  );
}

export default function Download(): JSX.Element {
  return (
    <Layout title="Download" description="Download Omniscribe for macOS, Windows, and Linux">
      <main className="container" style={{ padding: '3rem 0 5rem' }}>
        <DownloadContent />
      </main>
    </Layout>
  );
}
