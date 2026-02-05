export interface UpdateInfo {
  version: string;
  releaseNotes: string | null;
  releaseDate: string;
}

export interface UpdateDownloadProgress {
  bytesPerSecond: number;
  percent: number;
  transferred: number;
  total: number;
}

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
