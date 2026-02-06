export function isWindows(): boolean {
  return navigator.platform.startsWith('Win');
}

export function isMacOS(): boolean {
  return navigator.platform.startsWith('Mac');
}

export function isLinux(): boolean {
  return !isWindows() && !isMacOS();
}
