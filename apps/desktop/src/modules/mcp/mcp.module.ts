import { Module } from '@nestjs/common';
import {
  McpDiscoveryService,
  McpInternalService,
  McpProjectCacheService,
  McpSessionRegistryService,
  McpTrackingService,
  McpWriterService,
} from './services';
import { McpStatusServerService } from './mcp-status-server.service';
import { McpGateway } from './mcp.gateway';

@Module({
  providers: [
    // Core services (in dependency order)
    McpSessionRegistryService,
    McpInternalService,
    McpTrackingService,
    McpStatusServerService,
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
  ],
})
export class McpModule {}
