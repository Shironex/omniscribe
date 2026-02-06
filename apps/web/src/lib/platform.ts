/** Whether the app is running on macOS */
export const IS_MAC = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';
