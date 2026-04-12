import { Injectable } from '@nestjs/common';
import { createLogger } from '@omniscribe/shared';
import { McpInternalService } from './mcp-internal.service';
import { CdpInfoService } from './cdp-info.service';
import { createOmniscribeCapability } from '../capabilities/omniscribe.capability';
import { playwrightWebCapability } from '../capabilities/playwright-web.capability';
import { createPlaywrightElectronCapability } from '../capabilities/playwright-electron.capability';
import type { McpCapability } from '../capabilities/capability.types';

/**
 * Registry of available MCP capabilities.
 *
 * Built-in capabilities (e.g. omniscribe status) are auto-registered in
 * the constructor. Future phases can register additional capabilities
 * (playwright, etc.) by calling `register()`.
 */
@Injectable()
export class McpCapabilityRegistryService {
  private readonly logger = createLogger('McpCapabilityRegistryService');
  private readonly caps = new Map<string, McpCapability>();

  constructor(internal: McpInternalService, cdp: CdpInfoService) {
    this.register(createOmniscribeCapability(internal));
    this.register(playwrightWebCapability);
    this.register(createPlaywrightElectronCapability(cdp));
  }

  register(cap: McpCapability): void {
    if (this.caps.has(cap.id)) {
      this.logger.warn(`Capability "${cap.id}" is already registered — overwriting`);
    }
    this.caps.set(cap.id, cap);
  }

  list(): McpCapability[] {
    return Array.from(this.caps.values());
  }

  get(id: string): McpCapability | undefined {
    return this.caps.get(id);
  }

  defaultEnabledIds(): string[] {
    return this.list()
      .filter(c => c.defaultEnabled)
      .map(c => c.id);
  }
}
