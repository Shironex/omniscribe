import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpConfigService } from './mcp-config.service';
import { McpStatusServerService } from './mcp-status-server.service';
import { McpGateway } from './mcp.gateway';

@Module({
  providers: [McpService, McpConfigService, McpStatusServerService, McpGateway],
  exports: [McpService, McpConfigService, McpStatusServerService],
})
export class McpModule {}
