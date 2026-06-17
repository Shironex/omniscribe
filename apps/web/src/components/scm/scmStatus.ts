import type { GitFileStatus } from '@omniscribe/shared';

/**
 * Single-letter badge for a git file status, matching VS Code's SCM letters:
 * M(odified), A(dded), D(eleted), R(enamed), C(opied), U(nmerged/conflict),
 * ?(untracked).
 */
export function statusLetter(status: GitFileStatus): string {
  switch (status) {
    case 'modified':
      return 'M';
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'conflicted':
      return 'U';
    case 'untracked':
      return '?';
    default:
      return '•';
  }
}

/**
 * Tailwind text-color class (via theme status tokens) for a git file status.
 * VS Code-ish palette: modified/renamed → warning (amber), added/untracked →
 * success (green), deleted → error (red), conflicted → error, copied → info.
 */
export function statusColorClass(status: GitFileStatus): string {
  switch (status) {
    case 'modified':
    case 'renamed':
      return 'text-status-warning';
    case 'added':
    case 'untracked':
      return 'text-status-success';
    case 'deleted':
      return 'text-status-error';
    case 'conflicted':
      return 'text-status-error';
    case 'copied':
      return 'text-status-info';
    default:
      return 'text-muted-foreground';
  }
}
