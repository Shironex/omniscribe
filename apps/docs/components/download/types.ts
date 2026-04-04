export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface PlatformRelease {
  platform: 'macos' | 'windows' | 'linux';
  label: string;
  assets: ReleaseAsset[];
  note: string;
}

export interface ReleaseData {
  version: string;
  publishedAt: string;
  releaseUrl: string;
  platforms: PlatformRelease[];
}
