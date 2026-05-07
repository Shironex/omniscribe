/**
 * Changelog Source Registration Types
 *
 * Provider-agnostic contract for "release notes" feeds. A plugin declares
 * where its release notes live (raw markdown URL, GitHub releases JSON, or
 * a custom backend-side fetcher) and the host owns:
 *   1. Fetching + caching (ETag, TTL, rate-limit / network fallback).
 *   2. Parsing into a uniform `ChangelogEntry[]` shape.
 *   3. Rendering the UI (latest entry expanded, older entries collapsed).
 *   4. Auto-registering a settings nav entry under the plugin's category.
 *
 * Plugins never touch `fetch`, `electron-store`, or the renderer store —
 * they make ONE call: `context.registerChangelogSource({...})`.
 */

import type { PluginIconComponent } from './frontend';

/**
 * A single parsed changelog entry. Shared between all fetcher kinds.
 */
export interface ChangelogEntry {
  /**
   * Version label as displayed to the user (e.g. `"2.1.132"`,
   * `"v2 — Project Phoenix"`). Used as the per-source map key — must be
   * stable per source.
   */
  version: string;

  /** Markdown body (rendered with the host's `<Markdown>` primitive). */
  bodyMarkdown: string;

  /** Optional ISO 8601 publish date. Surfaced in the UI when present. */
  publishedAt?: string;

  /**
   * Optional URL to a per-version page (e.g. GitHub release `html_url`).
   * Renders as a tiny chip if present.
   */
  url?: string;

  /**
   * Optional flag from the fetcher (e.g. GitHub `prerelease: true`).
   * UI may show a "pre-release" badge.
   */
  prerelease?: boolean;
}

/**
 * Declarative fetcher kinds. The host implements all three; plugins
 * declare which one applies and supply parameters. Fetcher logic
 * (network + cache + ETag + retry + rate-limit handling) lives entirely
 * in the host — plugins never touch network, electron-store, or `fetch()`.
 *
 * The `'custom'` variant is the escape hatch when neither built-in works
 * (e.g. a provider with auth-gated release notes). A `'custom'` fetcher
 * runs ENTIRELY IN THE MAIN PROCESS via the plugin's
 * `ProviderPluginContext.registerCustomChangelogFetcher(token, fn)` —
 * function references can't cross the WebSocket wire.
 */
export type ChangelogSourceKind =
  | {
      /** Fetch a raw markdown file (e.g. CHANGELOG.md on a default branch). */
      kind: 'github-markdown';
      /** Raw URL to the markdown document. Must be fetchable without auth. */
      url: string;
      /** Optional public URL to display as the "View on GitHub" affordance. Falls back to `url`. */
      viewUrl?: string;
    }
  | {
      /** Fetch the GitHub Releases JSON for a repo. */
      kind: 'github-releases';
      /** Repo identifier in `owner/name` form (e.g. `"openai/codex"`). */
      repo: string;
      /** Maximum number of releases to fetch (default 30, hard cap 100). */
      limit?: number;
      /** Whether to include pre-releases in the output (default `true`). */
      includePrereleases?: boolean;
      /**
       * Optional prefix to strip from each release's `tag_name` when
       * building the displayed version (e.g. `"rust-v"` for `openai/codex`,
       * which publishes both `rust-v0.129.0` and Node releases under one
       * repo). Stripped only when the tag begins with the prefix.
       */
      tagPrefix?: string;
      /**
       * Optional public URL to display as the "View on GitHub" affordance.
       * Defaults to `https://github.com/<repo>/releases`.
       */
      viewUrl?: string;
    }
  | {
      /**
       * Custom fetcher. The plugin supplies a backend-side function
       * registered via
       * `ProviderPluginContext.registerCustomChangelogFetcher(token, fn)`.
       * The host wraps it in the same cache + IPC machinery as the
       * built-in kinds.
       */
      kind: 'custom';
      /** Unique fetcher token registered by the plugin's backend. */
      fetcherToken: string;
      /** Optional public URL surfaced as the "View on GitHub"-style affordance. */
      viewUrl?: string;
    };

/**
 * A registered changelog source. The host derives:
 *   - One auto-registered settings section under the plugin's category.
 *   - One backend cache namespace (electron-store key `caches.${id}`).
 *   - One renderer store entry keyed by `id`.
 */
export interface ChangelogSourceRegistration {
  /**
   * Source identifier — must be unique across all plugins. Used as the
   * settings section id (`changelog:${id}`), the backend cache namespace,
   * and the lookup key on the frontend store. Recommended pattern: the
   * plugin's own short id (`"claude"`, `"codex"`).
   */
  id: string;

  /** Human-readable label shown in the settings sidebar (e.g. `"Claude Code"`). */
  label: string;

  /**
   * Optional category to attach the auto-registered settings section to.
   * Defaults to the plugin's own settings category if it has one
   * (`pluginId.replace(/^provider-/, '')`), with a final fallback of
   * `'integrations'`. Explicit value wins over inference.
   */
  categoryId?: string;

  /** Icon for the settings nav entry. Falls back to a generic Newspaper icon. */
  icon?: PluginIconComponent;

  /** Sort order for the settings section within its category (lower = higher). Default 50. */
  order?: number;

  /** Source kind + parameters. */
  source: ChangelogSourceKind;

  /**
   * Cache TTL in milliseconds. Default 6h (matches existing Claude behavior).
   * Min 60s, max 7d (host clamps). Plugins should not need to tune this.
   */
  cacheTtlMs?: number;
}
