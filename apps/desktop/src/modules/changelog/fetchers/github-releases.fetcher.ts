import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { ChangelogEntry, ChangelogResponse } from '@omniscribe/shared';

export interface ReleasesCacheEntry {
  entries: ChangelogEntry[];
  etag: string | null;
  fetchedAt: number;
}

export interface ReleasesFetchInput {
  sourceId: string;
  repo: string;
  /** Defaults to `https://github.com/<repo>/releases`. */
  viewUrl?: string;
  /** Default 30, hard cap 100. */
  limit?: number;
  /** Default `true`. UI gets the `prerelease` flag either way. */
  includePrereleases?: boolean;
  /** Optional prefix to strip from each release's `tag_name`. */
  tagPrefix?: string;
  cached: ReleasesCacheEntry | null;
  forceRefresh: boolean;
  cacheTtlMs: number;
  userAgent: string;
}

export interface ReleasesFetchOutput {
  cache: ReleasesCacheEntry | null;
  response: ChangelogResponse;
}

interface GithubRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  published_at?: string | null;
  html_url?: string | null;
  prerelease?: boolean;
  draft?: boolean;
}

const logger = createLogger('GithubReleasesFetcher');
const HARD_CAP = 100;
const DEFAULT_LIMIT = 30;

/**
 * Map a single GitHub release record to a `ChangelogEntry`.
 *
 * - `tagPrefix` is stripped from `tag_name` only when it begins with the
 *   prefix. Falls back to `name` when `tag_name` is missing.
 * - Body is rendered as-is (markdown).
 */
export function mapRelease(release: GithubRelease, tagPrefix?: string): ChangelogEntry | null {
  const rawTag = release.tag_name ?? release.name ?? '';
  if (!rawTag) return null;
  const version =
    tagPrefix && rawTag.startsWith(tagPrefix) ? rawTag.slice(tagPrefix.length) : rawTag;
  return {
    version,
    bodyMarkdown: release.body ?? '',
    publishedAt: release.published_at ?? undefined,
    url: release.html_url ?? undefined,
    prerelease: release.prerelease ?? false,
  };
}

/**
 * Pure (mostly) fetcher for `kind: 'github-releases'` sources.
 *
 * Mirrors the markdown fetcher's cache + ETag + 304 + rate-limit + stale
 * fallback semantics. Drafts are filtered. `includePrereleases: false`
 * filters pre-releases entirely; otherwise they're emitted with
 * `prerelease: true`.
 */
export async function fetchGithubReleases(input: ReleasesFetchInput): Promise<ReleasesFetchOutput> {
  const {
    sourceId,
    repo,
    cached,
    forceRefresh,
    cacheTtlMs,
    userAgent,
    tagPrefix,
    includePrereleases = true,
  } = input;
  const viewUrl = input.viewUrl ?? `https://github.com/${repo}/releases`;
  const sourceUrl = `https://api.github.com/repos/${repo}/releases`;
  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), HARD_CAP);

  const isFresh = (entry: ReleasesCacheEntry) => Date.now() - entry.fetchedAt < cacheTtlMs;

  const toPayload = (entry: ReleasesCacheEntry, fromCache: boolean): ChangelogResponse => ({
    data: {
      sourceId,
      entries: entry.entries,
      fetchedAt: entry.fetchedAt,
      sourceUrl,
      viewUrl,
      fromCache,
    },
  });

  if (!forceRefresh && cached && isFresh(cached)) {
    logger.debug(`Returning fresh cache for "${sourceId}"`);
    return { cache: null, response: toPayload(cached, true) };
  }

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (cached?.etag) {
    headers['If-None-Match'] = cached.etag;
  }

  const url = `${sourceUrl}?per_page=${limit}`;

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
    const refreshed: ReleasesCacheEntry = { ...cached, fetchedAt: Date.now() };
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

  let json: unknown;
  try {
    json = await response.json();
  } catch (error) {
    const message = extractErrorMessage(error);
    logger.warn(`Failed to parse JSON body for "${sourceId}": ${message}`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'parse_error', message } };
  }

  if (!Array.isArray(json)) {
    const message = 'GitHub releases response was not an array';
    logger.warn(`${message} for "${sourceId}"`);
    if (cached) {
      return { cache: null, response: toPayload(cached, true) };
    }
    return { cache: null, response: { error: 'parse_error', message } };
  }

  const releases = (json as GithubRelease[])
    .filter(r => r && !r.draft)
    .filter(r => includePrereleases || !r.prerelease);

  const entries = releases
    .map(r => mapRelease(r, tagPrefix))
    .filter((e): e is ChangelogEntry => e !== null);

  const next: ReleasesCacheEntry = {
    entries,
    etag: response.headers.get('etag'),
    fetchedAt: Date.now(),
  };
  logger.debug(`Cached ${entries.length} releases for "${sourceId}"`);
  return { cache: next, response: toPayload(next, false) };
}
