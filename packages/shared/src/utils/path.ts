/**
 * Normalize path separators to forward slashes.
 * Pure string operation — safe for both Node.js and browser environments.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
