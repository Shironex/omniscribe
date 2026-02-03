import { contextBridge, ipcRenderer } from 'electron';
import type { ClaudeCliStatus, GhCliStatus } from '@omniscribe/shared';

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
  };
  claude: {
    getStatus: () => Promise<ClaudeCliStatus>;
  };
  github: {
    getStatus: () => Promise<GhCliStatus>;
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
    message: (options) => ipcRenderer.invoke('dialog:message', options),
  },
  app: {
    getPath: (name: string) => ipcRenderer.invoke('app:get-path', name),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    checkCli: (tool: string) => ipcRenderer.invoke('app:check-cli', tool),
    isValidProject: (projectPath: string) => ipcRenderer.invoke('app:is-valid-project', projectPath),
  },
  claude: {
    getStatus: () => ipcRenderer.invoke('claude:get-status') as Promise<ClaudeCliStatus>,
  },
  github: {
    getStatus: () => ipcRenderer.invoke('github:get-status') as Promise<GhCliStatus>,
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
