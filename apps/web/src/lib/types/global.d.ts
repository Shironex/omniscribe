import type {
  ClaudeCliStatus,
  GhCliStatus,
  ClaudeVersionCheckResult,
  ClaudeVersionList,
  ClaudeInstallCommandOptions,
  ClaudeInstallCommand,
  UpdateInfo,
  UpdateDownloadProgress,
  UpdateChannel,
} from '@omniscribe/shared';

/**
 * Electron API exposed via contextBridge
 */
interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  };
  store: {
    get: <T>(key: string) => Promise<T | undefined>;
    set: <T>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  dialog?: {
    openDirectory: (options?: unknown) => Promise<string | null>;
    openFile: (options?: unknown) => Promise<string | null>;
    message: (options: {
      type?: 'none' | 'info' | 'error' | 'question' | 'warning';
      title?: string;
      message: string;
      detail?: string;
      buttons?: string[];
    }) => Promise<number>;
  };
  app?: {
    getPath: (name: string) => Promise<string>;
    getVersion: () => Promise<string>;
    checkCli: (tool: string) => Promise<boolean>;
    isValidProject: (projectPath: string) => Promise<{ valid: boolean; reason?: string }>;
    openLogsFolder: () => Promise<void>;
    clipboardWrite: (text: string) => Promise<void>;
    getBackendPort: () => Promise<number>;
    getWsAuthToken: () => Promise<string>;
    listLogFiles: () => Promise<Array<{ name: string; size: number; lastModified: number }>>;
    readLogFile: (fileName: string) => Promise<string>;
    openInEditor: (editorId: string, folderPath: string) => Promise<void>;
  };
  claude?: {
    getStatus: () => Promise<ClaudeCliStatus>;
    checkVersion: () => Promise<ClaudeVersionCheckResult | null>;
    getVersions: () => Promise<ClaudeVersionList>;
    getInstallCommand: (options: ClaudeInstallCommandOptions) => Promise<ClaudeInstallCommand>;
    runInstall: (command: string) => Promise<void>;
  };
  github?: {
    getStatus: () => Promise<GhCliStatus>;
  };
  updater?: {
    checkForUpdates: () => Promise<{ enabled: boolean; channel: UpdateChannel }>;
    startDownload: () => Promise<void>;
    installNow: () => Promise<void>;
    getChannel: () => Promise<UpdateChannel>;
    setChannel: (channel: UpdateChannel) => Promise<UpdateChannel>;
    onCheckingForUpdate: (callback: () => void) => () => void;
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateError: (callback: (message: string) => void) => () => void;
    onChannelChanged: (callback: (channel: UpdateChannel) => void) => () => void;
  };
  notification?: {
    sendTest: () => Promise<{ success: boolean; reason?: string }>;
    onNavigate: (callback: (data: { sessionId?: string; tabId?: string }) => void) => () => void;
  };
  thumbnail?: {
    set: (tabId: string, imagePath: string) => Promise<{ fileName: string } | null>;
    remove: (tabId: string, fileName: string) => Promise<void>;
  };
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
