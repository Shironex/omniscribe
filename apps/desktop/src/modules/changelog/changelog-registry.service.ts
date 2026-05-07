import { Injectable } from '@nestjs/common';
import type { ChangelogSourceKind } from '@omniscribe/plugin-api';
import type { CustomChangelogFetcher } from '@omniscribe/plugin-api';
import { createLogger } from '@omniscribe/shared';

export interface BackendChangelogSource {
  /** Source identifier — unique across all plugins. */
  id: string;
  /** Source kind + parameters (registered by the renderer over WS). */
  source: ChangelogSourceKind;
  /** TTL clamp [60s, 7d], default 6h. */
  cacheTtlMs: number;
  /** Public URL surfaced via the response payload. */
  viewUrl?: string;
}

const MIN_TTL_MS = 60 * 1000; // 1 minute
const MAX_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_CHANGELOG_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function clampTtl(ttl: number | undefined): number {
  if (typeof ttl !== 'number' || !Number.isFinite(ttl)) return DEFAULT_CHANGELOG_TTL_MS;
  return Math.min(Math.max(ttl, MIN_TTL_MS), MAX_TTL_MS);
}

/**
 * In-memory backend mirror of the renderer-side
 * `ChangelogSourceRegistration` map. Sources are populated when the
 * renderer emits `changelog:register-source` during plugin activation.
 *
 * Custom-kind fetchers are kept in a separate map keyed by the token the
 * frontend declared — function references can't cross the WebSocket wire,
 * so providers register implementations via
 * `ProviderPluginContext.registerCustomChangelogFetcher`.
 */
@Injectable()
export class ChangelogRegistryService {
  private readonly logger = createLogger('ChangelogRegistry');
  private readonly sources = new Map<string, BackendChangelogSource>();
  private readonly customFetchers = new Map<string, CustomChangelogFetcher>();

  /** Register a source (idempotent — overwrites with a warning). */
  register(input: {
    id: string;
    source: ChangelogSourceKind;
    cacheTtlMs?: number;
    viewUrl?: string;
  }): void {
    const ttl = clampTtl(input.cacheTtlMs);
    if (this.sources.has(input.id)) {
      this.logger.warn(`Source "${input.id}" already registered — overwriting`);
    }
    this.sources.set(input.id, {
      id: input.id,
      source: input.source,
      cacheTtlMs: ttl,
      viewUrl: input.viewUrl,
    });
    this.logger.debug(`Registered source "${input.id}" (kind=${input.source.kind}, ttl=${ttl}ms)`);
  }

  /** Remove a source registration. Returns true if a source was deleted. */
  unregister(id: string): boolean {
    const existed = this.sources.delete(id);
    if (existed) {
      this.logger.debug(`Unregistered source "${id}"`);
    }
    return existed;
  }

  get(id: string): BackendChangelogSource | undefined {
    return this.sources.get(id);
  }

  list(): BackendChangelogSource[] {
    return [...this.sources.values()];
  }

  /** Backend-side custom-fetcher registry (provider plugins only). */
  registerCustomFetcher(token: string, fetcher: CustomChangelogFetcher): void {
    if (this.customFetchers.has(token)) {
      this.logger.warn(`Custom changelog fetcher "${token}" already registered — overwriting`);
    }
    this.customFetchers.set(token, fetcher);
  }

  unregisterCustomFetcher(token: string): boolean {
    return this.customFetchers.delete(token);
  }

  getCustomFetcher(token: string): CustomChangelogFetcher | undefined {
    return this.customFetchers.get(token);
  }
}
