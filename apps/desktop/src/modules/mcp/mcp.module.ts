import { Module, forwardRef } from '@nestjs/common';
import {
  McpCapabilityRegistryService,
  McpCapabilityStateService,
  McpDiscoveryService,
  McpInternalService,
  McpProjectCacheService,
  McpSessionRegistryService,
  McpTrackingService,
  McpWriterService,
} from './services';
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
