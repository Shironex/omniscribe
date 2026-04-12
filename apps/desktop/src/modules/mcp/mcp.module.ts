import { Module, forwardRef } from '@nestjs/common';
import {
  McpDiscoveryService,
  McpInternalService,
  McpProjectCacheService,
  McpSessionRegistryService,
  McpTrackingService,
  McpWriterService,
} from './services';
import { McpCapabilityRegistryService } from './services/mcp-capability-registry.service';
import { McpCapabilityStateService } from './services/mcp-capability-state.service';
import { McpStatusServerService } from './mcp-status-server.service';
import { McpGateway } from './mcp.gateway';
import { WorkspaceModule } from '../workspace';

@Module({
  imports: [forwardRef(() => WorkspaceModule)],
  providers: [
    // Core services (in dependency order)
    McpSessionRegistryService,
    McpInternalService,
    McpTrackingService,
    McpStatusServerService,
    McpCapabilityRegistryService,
    McpCapabilityStateService,
    McpWriterService,
    McpDiscoveryService,
    McpProjectCacheService,
    // Gateway
    McpGateway,
  ],
  exports: [
    McpDiscoveryService,
    McpWriterService,
    McpSessionRegistryService,
    McpStatusServerService,
    McpCapabilityRegistryService,
    McpCapabilityStateService,
  ],
})
export class McpModule {}
