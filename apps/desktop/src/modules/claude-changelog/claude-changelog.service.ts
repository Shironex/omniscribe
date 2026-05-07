import { Injectable } from '@nestjs/common';
import Store from 'electron-store';
import { app } from 'electron';
import {
  ClaudeChangelogEntry,
  ClaudeChangelogPayload,
  ClaudeChangelogResponse,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';

export const CLAUDE_CHANGELOG_URL =
  'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md';

/** Cache TTL — 6 hours. */
export const CLAUDE_CHANGELOG_TTL_MS = 6 * 60 * 60 * 1000;

interface ChangelogCache {
  rawMarkdown: string;
  etag: string | null;
  fetchedAt: number;
}

interface StoreSchema {
  cache: ChangelogCache | null;
  [key: string]: unknown;
}

/**
 * Parse the upstream Claude Code CHANGELOG.md into versioned entries.
 *
 * Upstream shape:
 *   # Changelog
 *
 *   ## 2.1.132
 *
 *   - bullet
 *   - bullet
 *
 *   ## 2.1.131
 *   ...
 *
 * The `# Changelog` preamble is discarded. Order is preserved (newest-first).
 * Header text is kept verbatim — no semver validation — so release codenames
 * still parse cleanly.
 */
export function parseChangelogMarkdown(md: string): ClaudeChangelogEntry[] {
  // Strip BOM, normalize line endings.
  const text = md
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const lines = text.split('\n');
  const out: ClaudeChangelogEntry[] = [];

  let currentVersion: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentVersion !== null) {
      out.push({ version: currentVersion, bodyMarkdown: buffer.join('\n').trim() });
    }
  };

  const headerRe = /^##\s+(.+)$/;
  for (const line of lines) {
    const m = headerRe.exec(line);
    if (m) {
      flush();
      currentVersion = m[1].trim();
      buffer = [];
    } else if (currentVersion !== null) {
      buffer.push(line);
    }
    // Lines before the first `## ` (e.g. `# Changelog` preamble) are ignored.
  }
  flush();

  return out.filter(entry => entry.version.length > 0);
}

@Injectable()
export class ClaudeChangelogService {
  private readonly logger = createLogger('ClaudeChangelogService');
  private store: Store<StoreSchema>;
  private readonly userAgent: string;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'claude-changelog',
      defaults: { cache: null },
    });

    let version: string;
    try {
      // `app` may be unavailable outside an Electron context (e.g. unit tests).
      version = app?.getVersion?.() ?? 'dev';
    } catch {
      version = 'dev';
    }
    this.userAgent = `Omniscribe/${version}`;
  }

  /**
   * Fetch the upstream Claude Code CHANGELOG, honouring the local cache TTL.
   *
   * Behaviour:
   * - Cache fresh && !forceRefresh → return cached payload with `fromCache: true`.
   * - Otherwise call `globalThis.fetch` with `If-None-Match` from the stored ETag.
   *   - 304 → bump `fetchedAt`, return cached body.
   *   - 200 → store new markdown + ETag, return parsed payload.
   *   - Network error → if cache exists, return stale cache (`fromCache: true`)
   *     with no error so the renderer can surface a "showing cached copy" hint;
   *     otherwise return an error response.
   */
  async fetchChangelog(forceRefresh = false): Promise<ClaudeChangelogResponse> {
    const cached = this.store.get('cache') as ChangelogCache | null;

    if (!forceRefresh && cached && this.isFresh(cached)) {
      this.logger.debug('Returning fresh cache');
      return { data: this.toPayload(cached, true) };
    }

    const headers: Record<string, string> = { 'User-Agent': this.userAgent };
    if (cached?.etag) {
      headers['If-None-Match'] = cached.etag;
    }

    let response: Response;
    try {
      response = await globalThis.fetch(CLAUDE_CHANGELOG_URL, { headers });
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.warn(`Network fetch failed: ${message}`);
      if (cached) {
        return { data: this.toPayload(cached, true) };
      }
      return { error: 'network', message };
    }

    if (response.status === 304 && cached) {
      this.logger.debug('304 Not Modified — bumping fetchedAt');
      const refreshed: ChangelogCache = { ...cached, fetchedAt: Date.now() };
      this.store.set('cache', refreshed);
      return { data: this.toPayload(refreshed, true) };
    }

    if (response.status === 403 || response.status === 429) {
      const message = `Rate limited (HTTP ${response.status})`;
      this.logger.warn(message);
      if (cached) {
        return { data: this.toPayload(cached, true) };
      }
      return { error: 'rate_limited', message };
    }

    if (!response.ok) {
      const message = `Unexpected response: HTTP ${response.status}`;
      this.logger.warn(message);
      if (cached) {
        return { data: this.toPayload(cached, true) };
      }
      return { error: 'unknown', message };
    }

    let rawMarkdown: string;
    try {
      rawMarkdown = await response.text();
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.warn(`Failed to read response body: ${message}`);
      if (cached) {
        return { data: this.toPayload(cached, true) };
      }
      return { error: 'network', message };
    }

    const next: ChangelogCache = {
      rawMarkdown,
      etag: response.headers.get('etag'),
      fetchedAt: Date.now(),
    };
    this.store.set('cache', next);
    this.logger.debug(`Cached new changelog (${rawMarkdown.length} bytes)`);
    return { data: this.toPayload(next, false) };
  }

  /** Whether the renderer can short-circuit a refresh request. */
  private isFresh(cache: ChangelogCache): boolean {
    return Date.now() - cache.fetchedAt < CLAUDE_CHANGELOG_TTL_MS;
  }

  private toPayload(cache: ChangelogCache, fromCache: boolean): ClaudeChangelogPayload {
    return {
      rawMarkdown: cache.rawMarkdown,
      entries: parseChangelogMarkdown(cache.rawMarkdown),
      fetchedAt: cache.fetchedAt,
      sourceUrl: CLAUDE_CHANGELOG_URL,
      fromCache,
    };
  }
}
