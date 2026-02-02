import { Injectable } from '@nestjs/common';
import { McpServerConfig } from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Raw MCP config file structure
 */
interface McpConfigFile {
  mcpServers?: Record<string, McpConfigEntry>;
}

/**
 * Individual MCP server entry from config file
 */
interface McpConfigEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: 'stdio' | 'sse' | 'websocket';
  enabled?: boolean;
  autoConnect?: boolean;
  timeout?: number;
  description?: string;
  retry?: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };
}

/**
 * MCP config file names to search for
 */
const MCP_CONFIG_FILES = ['.mcp.json', 'mcp.json', '.mcp/config.json'];

@Injectable()
export class McpService {
  /**
   * Discover MCP servers from a project's configuration files
   * @param projectPath Path to the project root
   * @returns Array of discovered MCP server configurations
   */
  async discoverServers(projectPath: string): Promise<McpServerConfig[]> {
    // Validate projectPath before using it with path.join
    if (!projectPath || typeof projectPath !== 'string') {
      console.warn('[McpService] discoverServers called with invalid projectPath:', projectPath);
      return [];
    }

    const servers: McpServerConfig[] = [];

    for (const configFile of MCP_CONFIG_FILES) {
      const configPath = path.join(projectPath, configFile);

      try {
        if (fs.existsSync(configPath)) {
          const content = await fs.promises.readFile(configPath, 'utf-8');
          const config = JSON.parse(content) as McpConfigFile;
          const parsedServers = this.parseConfig(config);
          servers.push(...parsedServers);

          console.log(
            `[McpService] Discovered ${parsedServers.length} servers from ${configPath}`
          );
        }
      } catch (error) {
        console.error(`[McpService] Error reading ${configPath}:`, error);
      }
    }

    // Remove duplicates by server ID
    const uniqueServers = new Map<string, McpServerConfig>();
    for (const server of servers) {
      if (!uniqueServers.has(server.id)) {
        uniqueServers.set(server.id, server);
      }
    }

    return Array.from(uniqueServers.values());
  }

  /**
   * Parse an MCP config file into server configurations
   * @param config Raw config file contents
   * @returns Array of parsed server configurations
   */
  parseConfig(config: McpConfigFile): McpServerConfig[] {
    const servers: McpServerConfig[] = [];

    if (!config.mcpServers) {
      return servers;
    }

    for (const [id, entry] of Object.entries(config.mcpServers)) {
      const server = this.parseServerEntry(id, entry);
      if (server) {
        servers.push(server);
      }
    }

    return servers;
  }

  /**
   * Parse a single server entry from config
   * @param id Server identifier
   * @param entry Server configuration entry
   * @returns Parsed server configuration or undefined if invalid
   */
  private parseServerEntry(
    id: string,
    entry: McpConfigEntry
  ): McpServerConfig | undefined {
    // Determine transport type
    let transport: 'stdio' | 'sse' | 'websocket' = 'stdio';

    if (entry.transport) {
      transport = entry.transport;
    } else if (entry.url) {
      // Infer transport from URL
      if (entry.url.startsWith('ws://') || entry.url.startsWith('wss://')) {
        transport = 'websocket';
      } else if (
        entry.url.startsWith('http://') ||
        entry.url.startsWith('https://')
      ) {
        transport = 'sse';
      }
    }

    // Validate required fields based on transport
    if (transport === 'stdio' && !entry.command) {
      console.warn(
        `[McpService] Server "${id}" has stdio transport but no command specified`
      );
      return undefined;
    }

    if ((transport === 'sse' || transport === 'websocket') && !entry.url) {
      console.warn(
        `[McpService] Server "${id}" has ${transport} transport but no URL specified`
      );
      return undefined;
    }

    return {
      id,
      name: id,
      description: entry.description,
      transport,
      command: entry.command,
      args: entry.args,
      env: entry.env,
      url: entry.url,
      enabled: entry.enabled ?? true,
      autoConnect: entry.autoConnect ?? false,
      timeout: entry.timeout,
      retry: entry.retry,
    };
  }

  /**
   * Validate a server configuration
   * @param config Server configuration to validate
   * @returns True if valid, false otherwise
   */
  validateConfig(config: McpServerConfig): boolean {
    if (!config.id || !config.name) {
      return false;
    }

    if (config.transport === 'stdio' && !config.command) {
      return false;
    }

    if (
      (config.transport === 'sse' || config.transport === 'websocket') &&
      !config.url
    ) {
      return false;
    }

    return true;
  }
}
