import { contextBridge, ipcRenderer } from 'electron';
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

export interface ElectronAPI {
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
  dialog: {
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
  app: {
    getPath: (name: string) => Promise<string>;
    getVersion: () => Promise<string>;
    checkCli: (tool: string) => Promise<boolean>;
    isValidProject: (projectPath: string) => Promise<{ valid: boolean; reason?: string }>;
    openLogsFolder: () => Promise<void>;
  };
  claude: {
    getStatus: () => Promise<ClaudeCliStatus>;
    checkVersion: () => Promise<ClaudeVersionCheckResult | null>;
    getVersions: () => Promise<ClaudeVersionList>;
    getInstallCommand: (options: ClaudeInstallCommandOptions) => Promise<ClaudeInstallCommand>;
    runInstall: (command: string) => Promise<void>;
  };
  github: {
    getStatus: () => Promise<GhCliStatus>;
  };
  updater: {
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
  platform: NodeJS.Platform;
}

const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback: (maximized: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => {
        callback(maximized);
      };
      ipcRenderer.on('window:maximized-change', listener);
      return () => {
        ipcRenderer.removeListener('window:maximized-change', listener);
      };
    },
  },
  store: {
    get: <T>(key: string) => ipcRenderer.invoke('store:get', key) as Promise<T | undefined>,
    set: <T>(key: string, value: T) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },
  dialog: {
    openDirectory: (options?: unknown) => ipcRenderer.invoke('dialog:open-directory', options),
    openFile: (options?: unknown) => ipcRenderer.invoke('dialog:open-file', options),
    message: options => ipcRenderer.invoke('dialog:message', options),
  },
  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    checkCli: (tool: string) => ipcRenderer.invoke('app:check-cli', tool),
    isValidProject: (projectPath: string) =>
      ipcRenderer.invoke('app:is-valid-project', projectPath),
    openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder') as Promise<void>,
  },
  claude: {
    getStatus: () => ipcRenderer.invoke('claude:get-status') as Promise<ClaudeCliStatus>,
    checkVersion: () =>
      ipcRenderer.invoke('claude:check-version') as Promise<ClaudeVersionCheckResult | null>,
    getVersions: () => ipcRenderer.invoke('claude:get-versions') as Promise<ClaudeVersionList>,
    getInstallCommand: (options: ClaudeInstallCommandOptions) =>
      ipcRenderer.invoke('claude:get-install-command', options) as Promise<ClaudeInstallCommand>,
    runInstall: (command: string) =>
      ipcRenderer.invoke('claude:run-install', command) as Promise<void>,
  },
  github: {
    getStatus: () => ipcRenderer.invoke('github:get-status') as Promise<GhCliStatus>,
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    installNow: () => ipcRenderer.invoke('updater:install-now'),
    getChannel: () => ipcRenderer.invoke('updater:get-channel'),
    setChannel: (channel: UpdateChannel) => ipcRenderer.invoke('updater:set-channel', channel),
    onCheckingForUpdate: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('updater:checking-for-update', listener);
      return () => {
        ipcRenderer.removeListener('updater:checking-for-update', listener);
      };
    },
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:update-available', listener);
      return () => {
        ipcRenderer.removeListener('updater:update-available', listener);
      };
    },
    onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:update-not-available', listener);
      return () => {
        ipcRenderer.removeListener('updater:update-not-available', listener);
      };
    },
    onDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, progress: UpdateDownloadProgress) =>
        callback(progress);
      ipcRenderer.on('updater:download-progress', listener);
      return () => {
        ipcRenderer.removeListener('updater:download-progress', listener);
      };
    },
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, info: UpdateInfo) => callback(info);
      ipcRenderer.on('updater:update-downloaded', listener);
      return () => {
        ipcRenderer.removeListener('updater:update-downloaded', listener);
      };
    },
    onUpdateError: (callback: (message: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
      ipcRenderer.on('updater:error', listener);
      return () => {
        ipcRenderer.removeListener('updater:error', listener);
      };
    },
    onChannelChanged: (callback: (channel: UpdateChannel) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, channel: UpdateChannel) =>
        callback(channel);
      ipcRenderer.on('updater:channel-changed', listener);
      return () => {
        ipcRenderer.removeListener('updater:channel-changed', listener);
      };
    },
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
