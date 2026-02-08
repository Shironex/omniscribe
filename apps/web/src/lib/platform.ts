const platform = typeof window !== 'undefined' ? window.electronAPI?.platform : undefined;

/** Whether the app is running on macOS */
export const IS_MAC = platform === 'darwin';

/** Whether the app is running on Windows */
export const IS_WINDOWS = platform === 'win32';

/** Whether the app is running on Linux */
export const IS_LINUX = platform === 'linux';
