/**
 * Truncates a file path to a maximum length, preserving the last two segments.
 */
export function truncatePath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) return path;
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join('/')}`;
}
