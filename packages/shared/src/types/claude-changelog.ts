/**
 * Types for the upstream Claude Code CHANGELOG viewer.
 *
 * The desktop backend fetches the raw `CHANGELOG.md` from
 * `anthropics/claude-code` on GitHub, caches it (with ETag), parses it
 * into versioned entries, and ships both the raw markdown and the
 * pre-parsed entries to the renderer over WebSocket.
 */

export interface ClaudeChangelogFetchPayload {
  /** When true, bypass the cache TTL and force a network fetch. */
  forceRefresh?: boolean;
}

export interface ClaudeChangelogEntry {
  /** Header text from the upstream `## …` line, e.g. `"2.1.132"`. */
  version: string;
  /** Body markdown for the entry (everything after the version header, trimmed). */
  bodyMarkdown: string;
}

export interface ClaudeChangelogPayload {
  /** Raw upstream markdown, kept verbatim for fallback rendering. */
  rawMarkdown: string;
  /** Pre-parsed entries in upstream order (newest-first). */
  entries: ClaudeChangelogEntry[];
  /** Epoch ms of the last successful fetch (or stale-cache fallback). */
  fetchedAt: number;
  /** URL the markdown was fetched from. */
  sourceUrl: string;
  /**
   * `true` when this payload came from cache rather than a fresh network
   * round-trip — also used when a 304 Not Modified response keeps the
   * cached body. The renderer can show a "showing cached copy" hint when
   * a fresh fetch failed and we fell back to a stale entry.
   */
  fromCache: boolean;
}

export type ClaudeChangelogError = 'network' | 'parse_error' | 'rate_limited' | 'unknown';

export interface ClaudeChangelogResponse {
  data?: ClaudeChangelogPayload;
  error?: ClaudeChangelogError;
  message?: string;
}
