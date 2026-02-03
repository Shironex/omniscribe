import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { McpServerConfig } from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { McpStatusServerService } from './mcp-status-server.service';

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

@Injectable()
export class McpConfigService {
  private readonly configDir: string;
  private readonly internalMcpPath: string | null;

  constructor(
    @Inject(forwardRef(() => McpStatusServerService))
    private readonly statusServer: McpStatusServerService
  ) {
    // Use platform-appropriate temp directory
    this.configDir = path.join(os.tmpdir(), 'omniscribe', 'mcp-configs');
    this.ensureConfigDir();

    // Find the internal MCP server binary
    this.internalMcpPath = this.findInternalMcp();
    if (this.internalMcpPath) {
      console.log(
        `[McpConfigService] Found internal MCP server at: ${this.internalMcpPath}`
      );
    } else {
      console.warn(
        '[McpConfigService] Internal MCP server not found - status updates will be unavailable'
      );
    }
  }

  /**
   * Find the internal MCP server binary/script
   * Checks multiple locations in order of preference
   */
  private findInternalMcp(): string | null {
    const isWindows = process.platform === 'win32';

    // Candidate locations to check
    const candidates: string[] = [];

    // 1. Development: relative to desktop app
    candidates.push(
      path.join(__dirname, '..', '..', '..', '..', 'mcp-server', 'dist', 'index.js')
    );

    // 2. Development: from workspace root
    if (process.env.OMNISCRIBE_WORKSPACE_ROOT) {
      candidates.push(
        path.join(
          process.env.OMNISCRIBE_WORKSPACE_ROOT,
          'apps',
          'mcp-server',
          'dist',
          'index.js'
        )
      );
    }

    // 3. Bundled with app (production) - Electron provides resourcesPath
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
    if (resourcesPath) {
      candidates.push(path.join(resourcesPath, 'mcp-server', 'index.js'));
    }

    // 4. Global install locations
    if (isWindows) {
      candidates.push(
        path.join(os.homedir(), 'AppData', 'Local', 'omniscribe', 'mcp-server', 'index.js')
      );
    } else {
      candidates.push('/usr/local/lib/omniscribe/mcp-server/index.js');
      candidates.push(
        path.join(os.homedir(), '.local', 'lib', 'omniscribe', 'mcp-server', 'index.js')
      );
    }

    // Check each candidate
    for (const candidate of candidates) {
      try {
        const normalizedPath = path.normalize(candidate);
        if (fs.existsSync(normalizedPath)) {
          return normalizedPath;
        }
      } catch {
        // Continue to next candidate
      }
    }

    return null;
  }

  /**
   * Get the internal MCP server info
   * @returns Object with path and availability status
   */
  getInternalMcpInfo(): { available: boolean; path: string | null } {
    return {
      available: this.internalMcpPath !== null,
      path: this.internalMcpPath,
    };
  }

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
    if (this.internalMcpPath) {
      const statusUrl = this.statusServer.getStatusUrl();
      const instanceId = this.statusServer.getInstanceId();

      // Register this session with the status server for routing
      this.statusServer.registerSession(sessionId, projectPath);

      mcpServers['omniscribe'] = {
        type: 'stdio',
        command: 'node',
        args: [this.internalMcpPath],
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
      if (server.id === 'omniscribe' || server.name === 'omniscribe') {
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
      _omniscribe: {
        sessionId,
        projectPath,
        projectHash,
        updatedAt: new Date().toISOString(),
      },
    };

    // Write the config file
    await fs.promises.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    const serverCount = Object.keys(mcpServers).length;
    console.log(
      `[McpConfigService] Wrote MCP config to ${configPath} with ${serverCount} servers (internal: ${!!this.internalMcpPath}, external: ${servers.length})`
    );

    // Also track the config in our central location
    await this.trackConfig(projectHash, sessionId, configPath);

    return configPath;
  }

  /**
   * Remove omniscribe MCP entry from configuration file
   * Preserves user's other MCP servers - only removes omniscribe entry
   * @param workingDir Directory containing the config
   * @param sessionId Session identifier for status server cleanup
   * @returns True if omniscribe was removed, false if not found
   */
  async removeConfig(workingDir: string, sessionId?: string): Promise<boolean> {
    // Unregister session from status server
    if (sessionId) {
      this.statusServer.unregisterSession(sessionId);
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
      if (!mcpServers || !('omniscribe' in mcpServers)) {
        return false;
      }

      // Remove omniscribe entry
      delete mcpServers['omniscribe'];

      // Remove our metadata
      delete config['_omniscribe'];
      delete config['_metadata']; // Legacy field

      // Write back the config with remaining servers
      await fs.promises.writeFile(
        configPath,
        JSON.stringify(config, null, 2),
        'utf-8'
      );

      console.log(
        `[McpConfigService] Removed omniscribe from ${configPath}, preserved ${Object.keys(mcpServers).length} other servers`
      );

      return true;
    } catch (error) {
      console.error(`[McpConfigService] Error removing omniscribe from config:`, error);
    }

    return false;
  }

  /**
   * Get the path where session configs are tracked
   * @param projectHash Hash of the project path
   * @returns Path to the tracking directory
   */
  getTrackingDir(projectHash: string): string {
    return path.join(this.configDir, projectHash);
  }

  /**
   * Track a written config in the central location
   * @param projectHash Hash of the project path
   * @param sessionId Session identifier
   * @param configPath Path to the written config
   */
  private async trackConfig(
    projectHash: string,
    sessionId: string,
    configPath: string
  ): Promise<void> {
    const trackingDir = this.getTrackingDir(projectHash);

    try {
      await fs.promises.mkdir(trackingDir, { recursive: true });

      const trackingFile = path.join(trackingDir, `${sessionId}.json`);
      const trackingData = {
        sessionId,
        configPath,
        createdAt: new Date().toISOString(),
      };

      await fs.promises.writeFile(
        trackingFile,
        JSON.stringify(trackingData, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error(`[McpConfigService] Error tracking config:`, error);
    }
  }

  /**
   * Ensure the config directory exists
   */
  private ensureConfigDir(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
    } catch (error) {
      console.error(`[McpConfigService] Error creating config dir:`, error);
    }
  }

  /**
   * List all tracked sessions for a project
   * @param projectHash Hash of the project path
   * @returns Array of session IDs with active configs
   */
  async listTrackedSessions(projectHash: string): Promise<string[]> {
    const trackingDir = this.getTrackingDir(projectHash);
    const sessions: string[] = [];

    try {
      if (fs.existsSync(trackingDir)) {
        const files = await fs.promises.readdir(trackingDir);

        for (const file of files) {
          if (file.endsWith('.json')) {
            sessions.push(file.replace('.json', ''));
          }
        }
      }
    } catch (error) {
      console.error(`[McpConfigService] Error listing sessions:`, error);
    }

    return sessions;
  }

  /**
   * Clean up tracking for a session
   * @param projectHash Hash of the project path
   * @param sessionId Session identifier
   */
  async cleanupTracking(
    projectHash: string,
    sessionId: string
  ): Promise<void> {
    const trackingDir = this.getTrackingDir(projectHash);
    const trackingFile = path.join(trackingDir, `${sessionId}.json`);

    try {
      if (fs.existsSync(trackingFile)) {
        await fs.promises.unlink(trackingFile);
      }
    } catch (error) {
      console.error(`[McpConfigService] Error cleaning up tracking:`, error);
    }
  }
}
