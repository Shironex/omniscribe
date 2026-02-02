import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpConfigService } from './mcp-config.service';
import { McpMonitorService } from './mcp-monitor.service';
import { McpGateway } from './mcp.gateway';

@Module({
  providers: [McpService, McpConfigService, McpMonitorService, McpGateway],
  exports: [McpService, McpConfigService, McpMonitorService],
})
export class McpModule {}
