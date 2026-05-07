/**
 * Generic changelog wire types — shared between the Electron main process
 * (NestJS gateway) and the renderer (Zustand store).
 *
 * The host owns fetching + caching for every registered changelog source.
 * Each WebSocket request carries the `sourceId` of the registered source
 * (e.g. `'claude'`, `'codex'`).
 */

/** Single changelog entry surfaced to the renderer. */
export interface ChangelogEntry {
  /** Version label as displayed (e.g. `"2.1.132"`). Stable per source. */
  version: string;
  /** Markdown body for the entry. */
  bodyMarkdown: string;
  /** Optional ISO 8601 publish date. */
  publishedAt?: string;
  /** Optional URL to a per-version page (e.g. release html_url). */
  url?: string;
  /** Optional `prerelease` flag from the upstream source. */
  prerelease?: boolean;
}

/** Payload for `changelog:fetch` requests. */
export interface ChangelogFetchPayload {
  /** Registered source id — must match a `ChangelogSourceRegistration.id`. */
  sourceId: string;
  /** When `true`, bypass the cache TTL and force a network fetch. */
  forceRefresh?: boolean;
}

/** Payload for `changelog:refresh` requests (always force-refreshes). */
export interface ChangelogRefreshPayload {
  /** Registered source id. */
  sourceId: string;
}

/**
 * Successful changelog payload. Renderer-friendly — includes both the
 * parsed entries and bookkeeping metadata for the UI.
 */
export interface ChangelogPayload {
  /** Source id this payload was fetched for. */
  sourceId: string;
  /**
   * Optional raw markdown for sources whose upstream is a single
   * markdown document (`github-markdown` kind). Releases-kind sources
   * have no single document — this field is omitted.
   */
  rawMarkdown?: string;
  /** Pre-parsed entries in upstream order (newest-first). */
  entries: ChangelogEntry[];
  /** Epoch ms of the last successful fetch (or stale-cache fallback). */
  fetchedAt: number;
  /** URL the entries were fetched from (or a public page representing the source). */
  sourceUrl: string;
  /** Public URL for the "View on GitHub" affordance. */
  viewUrl?: string;
  /**
   * `true` when this payload came from cache rather than a fresh network
   * round-trip — also used when a 304 Not Modified response keeps the
   * cached body. The renderer can show a "showing cached copy" hint when
   * a fresh fetch failed and we fell back to a stale entry.
   */
  fromCache: boolean;
}

/** Coarse-grained error categories. The renderer only branches on these. */
export type ChangelogError = 'network' | 'parse_error' | 'rate_limited' | 'unknown';

/** Response envelope for `changelog:fetch` and `changelog:refresh`. */
export interface ChangelogResponse {
  data?: ChangelogPayload;
  error?: ChangelogError;
  message?: string;
}
