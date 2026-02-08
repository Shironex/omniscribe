import { useState, useEffect } from 'react';

/**
 * Fetches the app version from the Electron API.
 * Returns an empty string in dev mode (electronAPI unavailable).
 */
export function useAppVersion(): string {
  const [version, setVersion] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (window.electronAPI?.app?.getVersion) {
          const v = await window.electronAPI.app.getVersion();
          if (!cancelled && v) setVersion(v);
        }
      } catch {
        // electronAPI not available (dev mode) — ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
