export { ChangelogModule } from './changelog.module';
export { ChangelogService } from './changelog.service';
export { ChangelogRegistryService, DEFAULT_CHANGELOG_TTL_MS } from './changelog-registry.service';
export type { BackendChangelogSource } from './changelog-registry.service';
export { parseChangelogMarkdown } from './parsers/markdown.parser';
export {
  fetchGithubMarkdown,
  type MarkdownCacheEntry,
  type MarkdownFetchInput,
  type MarkdownFetchOutput,
} from './fetchers/github-markdown.fetcher';
export {
  fetchGithubReleases,
  mapRelease,
  type ReleasesCacheEntry,
  type ReleasesFetchInput,
  type ReleasesFetchOutput,
} from './fetchers/github-releases.fetcher';
export {
  fetchCustom,
  type CustomCacheEntry,
  type CustomFetchInput,
  type CustomFetchOutput,
} from './fetchers/custom.fetcher';
