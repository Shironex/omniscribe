import { Injectable } from '@nestjs/common';
import { McpServerConfig, MCP_SERVER_NAME, createLogger } from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { McpInternalService } from './mcp-internal.service';
import { McpTrackingService } from './mcp-tracking.service';
import { McpSessionRegistryService } from './mcp-session-registry.service';
import { McpStatusServerService } from '../mcp-status-server.service';

/**
 * Server entry format for written config
 * Note: Claude Code expects "type" not "transport"
 */
interface McpWrittenServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  type: string;
}

/**
 * Service responsible for writing MCP configuration files.
 *
 * Writes .mcp.json files to working directories with:
 * - The internal Omniscribe MCP server for status reporting
 * - All discovered external MCP servers from the project
 */
@Injectable()
export class McpWriterService {
  private readonly logger = createLogger('McpWriterService');

  constructor(
    private readonly internalService: McpInternalService,
    private readonly trackingService: McpTrackingService,
    private readonly sessionRegistry: McpSessionRegistryService,
    private readonly statusServer: McpStatusServerService
  ) {}

  /**
   * Generate a SHA256 hash of the project path (first 12 characters)
   * @param projectPath Full path to the project
   * @returns 12-character hex hash
   */
  generateProjectHash(projectPath: string): string {
    const normalized = path.normalize(projectPath).toLowerCase();
    const hash = crypto.createHash('sha256').update(normalized).digest('hex');
    return hash.substring(0, 12);
  }

  /**
   * Write MCP configuration file for a session
   * All discovered servers are included - no enable/disable filtering
   * @param workingDir Directory to write the config to
   * @param sessionId Session identifier
   * @param projectPath Original project path
   * @param servers Array of MCP server configurations to include
   * @returns Path to the written config file
   */
  async writeConfig(
    workingDir: string,
    sessionId: string,
    projectPath: string,
    servers: McpServerConfig[]
  ): Promise<string> {
    const projectHash = this.generateProjectHash(projectPath);
    const configFileName = `.mcp.json`;
    const configPath = path.join(workingDir, configFileName);

    const mcpServers: Record<string, McpWrittenServerEntry> = {};

    // Add internal MCP server (always included if available)
    const internalPath = this.internalService.getPath();
    if (internalPath) {
      const statusUrl = this.statusServer.getStatusUrl();
      const instanceId = this.statusServer.getInstanceId();

      // Register this session with the registry for routing
      this.sessionRegistry.registerSession(sessionId, projectPath);

      mcpServers[MCP_SERVER_NAME] = {
        type: 'stdio',
        command: 'node',
        args: [internalPath],
        env: {
          OMNISCRIBE_SESSION_ID: sessionId,
          OMNISCRIBE_PROJECT_HASH: projectHash,
          ...(statusUrl ? { OMNISCRIBE_STATUS_URL: statusUrl } : {}),
          ...(instanceId ? { OMNISCRIBE_INSTANCE_ID: instanceId } : {}),
        },
      };
    }

    // Build server entries for all discovered servers
    for (const server of servers) {
      // Skip the internal omniscribe server - it's handled above
      if (server.id === MCP_SERVER_NAME || server.name === MCP_SERVER_NAME) {
        continue;
      }

      const entry: McpWrittenServerEntry = {
        type: server.transport,
      };

      if (server.command) {
        entry.command = server.command;
      }

      if (server.args && server.args.length > 0) {
        entry.args = server.args;
      }

      if (server.env && Object.keys(server.env).length > 0) {
        entry.env = server.env;
      }

      if (server.url) {
        entry.url = server.url;
      }

      mcpServers[server.id] = entry;
    }

    // Build final config
    const config = {
      mcpServers,
      [`_${MCP_SERVER_NAME}`]: {
        sessionId,
        projectPath,
        projectHash,
        updatedAt: new Date().toISOString(),
      },
    };

    // Write the config file
    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    const serverCount = Object.keys(mcpServers).length;
    this.logger.log(
      `Wrote MCP config to ${configPath} with ${serverCount} servers (internal: ${!!internalPath}, external: ${servers.length})`
    );

    // Also track the config in our central location
    await this.trackingService.track(projectHash, sessionId, configPath);

    return configPath;
  }

  /**
   * Remove omniscribe MCP entry from configuration file
   * Preserves user's other MCP servers - only removes omniscribe entry
   * @param workingDir Directory containing the config
   * @param sessionId Session identifier for cleanup
   * @returns True if omniscribe was removed, false if not found
   */
  async removeConfig(workingDir: string, sessionId?: string): Promise<boolean> {
    // Unregister session from registry
    if (sessionId) {
      this.sessionRegistry.unregisterSession(sessionId);
    }
    const configPath = path.join(workingDir, '.mcp.json');

    try {
      if (!fs.existsSync(configPath)) {
        return false;
      }

      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as Record<string, unknown>;

      // Check if this config has omniscribe entry
      const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
      if (!mcpServers || !(MCP_SERVER_NAME in mcpServers)) {
        return false;
      }

      // Remove omniscribe entry
      delete mcpServers[MCP_SERVER_NAME];

      // Remove our metadata
      delete config[`_${MCP_SERVER_NAME}`];
      delete config['_metadata']; // Legacy field

      // Write back the config with remaining servers
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      this.logger.log(
        `Removed omniscribe from ${configPath}, preserved ${Object.keys(mcpServers).length} other servers`
      );

      return true;
    } catch (error) {
      this.logger.error('Error removing omniscribe from config:', error);
    }

    return false;
  }

  /**
   * Get the internal MCP server info
   * @returns Object with path and availability status
   */
  getInternalMcpInfo(): { available: boolean; path: string | null } {
    return this.internalService.getInternalMcpInfo();
  }
}
