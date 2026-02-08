export type UpdateChannel = 'stable' | 'beta';
export const DEFAULT_UPDATE_CHANNEL: UpdateChannel = 'stable';

export interface UpdateInfo {
  version: string;
  releaseNotes: string | null;
  releaseDate: string;
  channel?: UpdateChannel;
  isDowngrade?: boolean;
}

export interface UpdateDownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

/**
 * Sentinel error string sent when electron-updater gets a 404 on latest.yml.
 * This typically means the CI release pipeline is still building artifacts.
 */
export const UPDATE_ERROR_RELEASE_PENDING = 'RELEASE_PENDING';
