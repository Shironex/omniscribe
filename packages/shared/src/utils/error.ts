/**
 * Extract a human-readable error message from an unknown error value.
 *
 * @param error - The caught error value (could be anything)
 * @param fallback - Fallback message when error is not an Error instance (default: stringifies the error)
 * @returns A string error message
 */
export function extractErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback ?? String(error);
}
