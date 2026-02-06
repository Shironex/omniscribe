/**
 * Truncates a file path to a maximum length, preserving the last two segments.
 */
export function truncatePath(path: string, maxLength = 50): string {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.length <= maxLength) return normalized;
  const parts = normalized.split('/');
  if (parts.length <= 2) return normalized;
  return `.../${parts.slice(-2).join('/')}`;
}
