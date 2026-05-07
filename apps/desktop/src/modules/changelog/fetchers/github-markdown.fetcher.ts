import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { ChangelogResponse } from '@omniscribe/shared';
import { parseChangelogMarkdown } from '../parsers/markdown.parser';

export interface MarkdownCacheEntry {
  rawMarkdown: string;
  etag: string | null;
  fetchedAt: number;
}

export interface MarkdownFetchInput {
  sourceId: string;
  url: string;
  /** Falls back to `url` when omitted. */
  viewUrl?: string;
  cached: MarkdownCacheEntry | null;
  forceRefresh: boolean;
  cacheTtlMs: number;
  userAgent: string;
}

export interface MarkdownFetchOutput {
  /** Updated cache entry to persist (or `null` to leave the cache untouched). */
  cache: MarkdownCacheEntry | null;
  /** Response envelope to forward to the renderer. */
  response: ChangelogResponse;
}

const logger = createLogger('GithubMarkdownFetcher');

/**
 * Pure (mostly) fetcher for `kind: 'github-markdown'` sources.
 *
 * - Honours TTL (returns cached payload when fresh and `!forceRefresh`).
 * - Sends `If-None-Match` from the cached ETag.
 * - 304 → bumps `fetchedAt`, returns cached body.
 * - 200 → stores new markdown + ETag.
 * - Network / rate-limit errors fall back to a stale cache when present;
 *   otherwise return a typed error.
 */
export async function fetchGithubMarkdown(input: MarkdownFetchInput): Promise<MarkdownFetchOutput> {
  const { sourceId, url, cached, forceRefresh, cacheTtlMs, userAgent } = input;
  const viewUrl = input.viewUrl ?? url;

  const isFresh = (entry: MarkdownCacheEntry) => Date.now() - entry.fetchedAt < cacheTtlMs;

  const toPayload = (entry: MarkdownCacheEntry, fromCache: boolean): ChangelogResponse => ({
    data: {
      sourceId,
      rawMarkdown: entry.rawMarkdown,
      entries: parseChangelogMarkdown(entry.rawMarkdown),
      fetchedAt: entry.fetchedAt,
      sourceUrl: url,
      viewUrl,
      fromCache,
    },
  });

  if (!forceRefresh && cached && isFresh(cached)) {
    logger.debug(`Returning fresh cache for "${sourceId}"`);
    return { cache: null, response: toPayload(cached, true) };
  }

  const headers: Record<string, string> = { 'User-Agent': userAgent };
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }

  let response: Response;
  try {
    response = await globalThis.fetch(url, { headers });
  } catch (error) {
    const message = extractErrorMessage(error);
    logger.warn(`Network fetch failed for "${sourceId}": ${message}`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'network', message } };
  }

  if (response.status === 304 && cached) {
    logger.debug(`304 Not Modified for "${sourceId}" — bumping fetchedAt`);
    const refreshed: MarkdownCacheEntry = { ...cached, fetchedAt: Date.now() };
    return { cache: refreshed, response: toPayload(refreshed, true) };
  }

  if (response.status === 403 || response.status === 429) {
    const message = `Rate limited (HTTP ${response.status})`;
    logger.warn(`${message} for "${sourceId}"`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'rate_limited', message } };
  }

  if (!response.ok) {
    const message = `Unexpected response: HTTP ${response.status}`;
    logger.warn(`${message} for "${sourceId}"`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'unknown', message } };
  }

  let rawMarkdown: string;
  try {
    rawMarkdown = await response.text();
  } catch (error) {
    const message = extractErrorMessage(error);
    logger.warn(`Failed to read response body for "${sourceId}": ${message}`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'network', message } };
  }

  const next: MarkdownCacheEntry = {
    rawMarkdown,
    etag: response.headers.get('etag'),
    fetchedAt: Date.now(),
  };
  logger.debug(`Cached new changelog for "${sourceId}" (${rawMarkdown.length} bytes)`);
  return { cache: next, response: toPayload(next, false) };
}
