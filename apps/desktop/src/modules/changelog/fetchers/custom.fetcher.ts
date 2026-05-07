import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { ChangelogEntry, ChangelogResponse } from '@omniscribe/shared';
import type { CustomChangelogFetcher } from '@omniscribe/plugin-api';

export interface CustomCacheEntry {
  entries: ChangelogEntry[];
  fetchedAt: number;
}

export interface CustomFetchInput {
  sourceId: string;
  fetcherToken: string;
  fetcher: CustomChangelogFetcher | undefined;
  /** Optional public URL surfaced on the response payload. */
  viewUrl?: string;
  cached: CustomCacheEntry | null;
  forceRefresh: boolean;
  cacheTtlMs: number;
}

export interface CustomFetchOutput {
  cache: CustomCacheEntry | null;
  response: ChangelogResponse;
}

const logger = createLogger('CustomChangelogFetcher');

/**
 * Trampoline for `kind: 'custom'` sources.
 *
 * The provider plugin's backend `activate(ctx)` calls
 * `ctx.registerCustomChangelogFetcher(token, fn)`. The frontend's
 * `registerChangelogSource({ source: { kind: 'custom', fetcherToken } })`
 * carries the matching token. This trampoline looks up the registered
 * function by token and runs it under the same TTL cache as the built-in
 * fetcher kinds.
 */
export async function fetchCustom(input: CustomFetchInput): Promise<CustomFetchOutput> {
  const { sourceId, fetcherToken, fetcher, cached, forceRefresh, cacheTtlMs } = input;

  const isFresh = (entry: CustomCacheEntry) => Date.now() - entry.fetchedAt < cacheTtlMs;

  const toPayload = (entry: CustomCacheEntry, fromCache: boolean): ChangelogResponse => ({
    data: {
      sourceId,
      entries: entry.entries,
      fetchedAt: entry.fetchedAt,
      sourceUrl: input.viewUrl ?? '',
      viewUrl: input.viewUrl,
      fromCache,
    },
  });

  if (!fetcher) {
    const message = `No backend fetcher registered for token "${fetcherToken}"`;
    logger.warn(message);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'unknown', message } };
  }

  if (!forceRefresh && cached && isFresh(cached)) {
    logger.debug(`Returning fresh cache for "${sourceId}"`);
    return { cache: null, response: toPayload(cached, true) };
  }

  let entries: ChangelogEntry[];
  try {
    entries = await fetcher();
  } catch (error) {
    const message = extractErrorMessage(error);
    logger.warn(`Custom fetcher "${fetcherToken}" failed for "${sourceId}": ${message}`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'unknown', message } };
  }

  if (!Array.isArray(entries)) {
    const message = `Custom fetcher "${fetcherToken}" returned a non-array result`;
    logger.warn(`${message} for "${sourceId}"`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'parse_error', message } };
  }

  const next: CustomCacheEntry = {
    entries,
    fetchedAt: Date.now(),
  };
  logger.debug(`Cached ${entries.length} entries from custom fetcher for "${sourceId}"`);
  return { cache: next, response: toPayload(next, false) };
}
