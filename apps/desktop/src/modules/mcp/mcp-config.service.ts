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
  private readonly omniscribeMcpPath: string | null;

  constructor(
    @Inject(forwardRef(() => McpStatusServerService))
    private readonly statusServer: McpStatusServerService
  ) {
    // Use platform-appropriate temp directory
    this.configDir = path.join(os.tmpdir(), 'omniscribe', 'mcp-configs');
    this.ensureConfigDir();

    // Find the Omniscribe MCP server binary
    this.omniscribeMcpPath = this.findOmniscribeMcp();
    if (this.omniscribeMcpPath) {
      console.log(
        `[McpConfigService] Found Omniscribe MCP server at: ${this.omniscribeMcpPath}`
      );
    } else {
      console.warn(
        '[McpConfigService] Omniscribe MCP server not found - status updates will be unavailable'
      );
    }
  }

  /**
   * Find the Omniscribe MCP server binary/script
   * Checks multiple locations in order of preference
   */
  private findOmniscribeMcp(): string | null {
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
   * Get the Omniscribe MCP server info
   * @returns Object with path and availability status
   */
  getOmniscribeMcpInfo(): { available: boolean; path: string | null } {
    return {
      available: this.omniscribeMcpPath !== null,
      path: this.omniscribeMcpPath,
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
   * Merges omniscribe server into existing config, preserving user's other MCP servers
   * @param workingDir Directory to write the config to
   * @param sessionId Session identifier
   * @param projectPath Original project path
   * @param servers Array of enabled MCP server configurations
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

    // Read existing config if it exists (preserve user's MCP servers)
    let existingConfig: Record<string, unknown> = {};
    let existingMcpServers: Record<string, unknown> = {};

    try {
      if (fs.existsSync(configPath)) {
        const content = await fs.promises.readFile(configPath, 'utf-8');
        existingConfig = JSON.parse(content);
        existingMcpServers = (existingConfig.mcpServers as Record<string, unknown>) ?? {};
        console.log(
          `[McpConfigService] Found existing .mcp.json with ${Object.keys(existingMcpServers).length} servers`
        );
      }
    } catch (error) {
      console.warn(`[McpConfigService] Could not read existing config:`, error);
    }

    // Start with existing servers
    const mcpServers: Record<string, McpWrittenServerEntry> = {
      ...(existingMcpServers as Record<string, McpWrittenServerEntry>),
    };

    // Add/update Omniscribe MCP server (always included if available)
    // Session-specific env vars are now included directly in the MCP config
    // since they're read by Claude Code when it spawns the MCP server process.
    // This enables HTTP-based status reporting to the desktop app.
    if (this.omniscribeMcpPath) {
      const statusUrl = this.statusServer.getStatusUrl();
      const instanceId = this.statusServer.getInstanceId();

      // Register this session with the status server for routing
      this.statusServer.registerSession(sessionId, projectPath);

      mcpServers['omniscribe'] = {
        type: 'stdio',
        command: 'node',
        args: [this.omniscribeMcpPath],
        env: {
          // Session-specific env vars for HTTP status reporting
          OMNISCRIBE_SESSION_ID: sessionId,
          OMNISCRIBE_PROJECT_HASH: projectHash,
          ...(statusUrl ? { OMNISCRIBE_STATUS_URL: statusUrl } : {}),
          ...(instanceId ? { OMNISCRIBE_INSTANCE_ID: instanceId } : {}),
        },
      };
    }

    // Build server entries for additional enabled servers
    for (const server of servers) {
      if (!server.enabled) {
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

    // Build final config - preserve any other top-level fields from existing config
    const config = {
      ...existingConfig,
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
      `[McpConfigService] Wrote MCP config to ${configPath} with ${serverCount} servers (omniscribe: ${!!this.omniscribeMcpPath})`
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
