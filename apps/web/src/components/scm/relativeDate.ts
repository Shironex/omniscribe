/**
 * Format an ISO-8601 date as a short relative string ("3m", "2h", "5d", "3w",
 * "2mo", "1y") for compact commit-history rows. Falls back to a localized date
 * for anything older than ~a year or when the input can't be parsed.
 */
export function formatRelativeDate(iso: string, now: number = Date.now()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;

  const seconds = Math.max(0, Math.floor((now - then) / 1000));

  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(days / 365);
  if (years < 1) return `${months}mo ago`;
  return `${years}y ago`;
}
