interface ElectronWindowAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronWindowAPI;
  }
}

export {};
