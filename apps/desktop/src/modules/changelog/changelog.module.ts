import { Global, Module } from '@nestjs/common';
import { ChangelogService } from './changelog.service';
import { ChangelogGateway } from './changelog.gateway';
import { ChangelogRegistryService } from './changelog-registry.service';

/**
 * Generic changelog module. Exposes a per-source registry and one
 * orchestrator service that dispatches to the right fetcher (markdown /
 * releases / custom). `@Global` so any provider plugin module can inject
 * `ChangelogRegistryService` to register a custom backend fetcher.
 */
@Global()
@Module({
  providers: [ChangelogService, ChangelogGateway, ChangelogRegistryService],
  exports: [ChangelogService, ChangelogRegistryService],
})
export class ChangelogModule {}
