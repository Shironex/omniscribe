/**
 * Format an epoch ms timestamp as a coarse relative-time label.
 * Pure / synchronous so the renderer can call it during render with no
 * dependency on `Intl.RelativeTimeFormat`.
 */
export function formatRelative(epochMs: number | null | undefined): string {
  if (!epochMs) return 'never';
  const diff = Date.now() - epochMs;
  if (diff < 0) return 'just now';
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(epochMs).toLocaleDateString();
}
