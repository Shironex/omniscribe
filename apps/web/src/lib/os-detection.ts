const platform =
  (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ??
  navigator.platform ??
  'unknown';

export function isWindows(): boolean {
  return platform.startsWith('Win') || platform === 'Windows';
}

export function isMacOS(): boolean {
  return platform.startsWith('Mac') || platform === 'macOS';
}

export function isLinux(): boolean {
  return !isWindows() && !isMacOS();
}
