import { Injectable } from '@nestjs/common';
import Store from 'electron-store';
import { app } from 'electron';
import { createLogger } from '@omniscribe/shared';
import type { ChangelogResponse } from '@omniscribe/shared';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ChangelogRegistryService } from './changelog-registry.service';
import { fetchGithubMarkdown, type MarkdownCacheEntry } from './fetchers/github-markdown.fetcher';
import { fetchGithubReleases, type ReleasesCacheEntry } from './fetchers/github-releases.fetcher';
import { fetchCustom, type CustomCacheEntry } from './fetchers/custom.fetcher';

/**
 * Per-source cache slot. Discriminated by `kind` so the orchestrator can
 * route to the right fetcher without re-reading the registration on every
 * cache hit.
 */
type ChangelogCache =
  | ({ kind: 'github-markdown' } & MarkdownCacheEntry)
  | ({ kind: 'github-releases' } & ReleasesCacheEntry)
  | ({ kind: 'custom' } & CustomCacheEntry);

interface StoreSchema {
  caches: Record<string, ChangelogCache | null>;
  /** Internal: marks the one-time legacy migration as completed. */
  legacyMigrated?: boolean;
  [key: string]: unknown;
}

const STORE_NAME = 'changelog';
const LEGACY_STORE_NAME = 'claude-changelog';

@Injectable()
export class ChangelogService {
  private readonly logger = createLogger('ChangelogService');
  private readonly store: Store<StoreSchema>;
  private readonly userAgent: string;

  constructor(private readonly registry: ChangelogRegistryService) {
    this.store = new Store<StoreSchema>({
      name: STORE_NAME,
      defaults: { caches: {} },
    });
    this.migrateLegacyClaudeCache();

    let version: string;
    try {
      version = app?.getVersion?.() ?? 'dev';
    } catch {
      version = 'dev';
    }
    this.userAgent = `Omniscribe/${version}`;
  }

  /**
   * Fetch (or refresh) a registered changelog source. Returns the same
   * `ChangelogResponse` envelope the renderer expects.
   *
   * - Unknown source id → `error: 'unknown'`.
   * - Otherwise dispatches to the registered fetcher kind.
   */
  async fetchChangelog(sourceId: string, forceRefresh = false): Promise<ChangelogResponse> {
    const registration = this.registry.get(sourceId);
    if (!registration) {
      const message = `No changelog source registered for "${sourceId}"`;
      this.logger.warn(message);
      return { error: 'unknown', message };
    }

    const { source, cacheTtlMs, viewUrl } = registration;

    switch (source.kind) {
      case 'github-markdown': {
        const cached = this.getCacheTyped<MarkdownCacheEntry>(sourceId, 'github-markdown');
        const result = await fetchGithubMarkdown({
          sourceId,
          url: source.url,
          viewUrl: source.viewUrl ?? viewUrl,
          cached,
          forceRefresh,
          cacheTtlMs,
          userAgent: this.userAgent,
        });
        if (result.cache) {
          this.setCache(sourceId, { kind: 'github-markdown', ...result.cache });
        }
        return result.response;
      }
      case 'github-releases': {
        const cached = this.getCacheTyped<ReleasesCacheEntry>(sourceId, 'github-releases');
        const result = await fetchGithubReleases({
          sourceId,
          repo: source.repo,
          viewUrl: source.viewUrl ?? viewUrl,
          limit: source.limit,
          includePrereleases: source.includePrereleases,
          tagPrefix: source.tagPrefix,
          cached,
          forceRefresh,
          cacheTtlMs,
          userAgent: this.userAgent,
        });
        if (result.cache) {
          this.setCache(sourceId, { kind: 'github-releases', ...result.cache });
        }
        return result.response;
      }
      case 'custom': {
        const cached = this.getCacheTyped<CustomCacheEntry>(sourceId, 'custom');
        const fetcher = this.registry.getCustomFetcher(source.fetcherToken);
        const result = await fetchCustom({
          sourceId,
          fetcherToken: source.fetcherToken,
          fetcher,
          viewUrl: source.viewUrl ?? viewUrl,
          cached,
          forceRefresh,
          cacheTtlMs,
        });
        if (result.cache) {
          this.setCache(sourceId, { kind: 'custom', ...result.cache });
        }
        return result.response;
      }
    }
  }

  /** Drop the cache for a single source (or all sources when omitted). */
  clearCache(sourceId?: string): void {
    if (sourceId) {
      const caches = { ...this.store.get('caches') };
      delete caches[sourceId];
      this.store.set('caches', caches);
      return;
    }
    this.store.set('caches', {});
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private getCacheTyped<T>(sourceId: string, kind: ChangelogCache['kind']): T | null {
    const caches = this.store.get('caches') ?? {};
    const cached = caches[sourceId];
    if (!cached || cached.kind !== kind) {
      return null;
    }
    // The discriminator is stripped by callers — they only care about the
    // payload shape, not the kind tag.
    const { kind: _kind, ...rest } = cached;
    return rest as T;
  }

  private setCache(sourceId: string, entry: ChangelogCache): void {
    const caches = { ...this.store.get('caches') };
    caches[sourceId] = entry;
    this.store.set('caches', caches);
  }

  /**
   * One-time migration from the legacy `claude-changelog.json` electron-
   * store file (a single `cache` slot for the Claude markdown changelog)
   * to the new `changelog.json` schema (`caches.claude` keyed slot).
   *
   * Idempotent — short-circuits when the `legacyMigrated` flag is set OR
   * when no legacy file exists. Tolerant of malformed legacy payloads
   * (logs and skips). Deletes the legacy file after a successful copy so
   * subsequent launches don't re-attempt the migration.
   */
  private migrateLegacyClaudeCache(): void {
    if (this.store.get('legacyMigrated')) {
      return;
    }

    let legacyPath: string;
    try {
      const userData = app?.getPath?.('userData');
      if (!userData) {
        this.store.set('legacyMigrated', true);
        return;
      }
      legacyPath = join(userData, `${LEGACY_STORE_NAME}.json`);
    } catch (error) {
      this.logger.debug(`Skipping legacy migration: ${(error as Error).message}`);
      this.store.set('legacyMigrated', true);
      return;
    }

    if (!existsSync(legacyPath)) {
      this.store.set('legacyMigrated', true);
      return;
    }

    try {
      const raw = readFileSync(legacyPath, 'utf8');
      const parsed = JSON.parse(raw) as {
        cache?: { rawMarkdown?: unknown; etag?: unknown; fetchedAt?: unknown } | null;
      };
      const legacy = parsed?.cache;
      if (
        legacy &&
        typeof legacy.rawMarkdown === 'string' &&
        typeof legacy.fetchedAt === 'number'
      ) {
        const caches = { ...this.store.get('caches') };
        caches.claude = {
          kind: 'github-markdown',
          rawMarkdown: legacy.rawMarkdown,
          etag: typeof legacy.etag === 'string' ? legacy.etag : null,
          fetchedAt: legacy.fetchedAt,
        };
        this.store.set('caches', caches);
        this.logger.log('Migrated legacy claude-changelog cache to changelog.json');
      } else {
        this.logger.debug('Legacy claude-changelog file present but had no cache slot — skipping');
      }
    } catch (error) {
      this.logger.warn(
        `Failed to migrate legacy claude-changelog cache: ${(error as Error).message}`
      );
    }

    try {
      unlinkSync(legacyPath);
    } catch (error) {
      this.logger.debug(
        `Failed to delete legacy claude-changelog file: ${(error as Error).message}`
      );
    }
    this.store.set('legacyMigrated', true);
  }
}
