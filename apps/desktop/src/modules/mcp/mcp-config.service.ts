import { Injectable } from '@nestjs/common';
import { McpServerConfig } from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';

/**
 * MCP config structure written to the working directory
 */
interface McpWrittenConfig {
  mcpServers: Record<string, McpWrittenServerEntry>;
  _metadata: {
    projectPath: string;
    sessionId: string;
    generatedAt: string;
    projectHash: string;
  };
}

/**
 * Server entry format for written config
 */
interface McpWrittenServerEntry {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport: string;
}

@Injectable()
export class McpConfigService {
  private readonly configDir: string;

  constructor() {
    // Use platform-appropriate temp directory
    this.configDir = path.join(os.tmpdir(), 'omniscribe', 'mcp-configs');
    this.ensureConfigDir();
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

    const config: McpWrittenConfig = {
      mcpServers: {},
      _metadata: {
        projectPath,
        sessionId,
        generatedAt: new Date().toISOString(),
        projectHash,
      },
    };

    // Build server entries for enabled servers
    for (const server of servers) {
      if (!server.enabled) {
        continue;
      }

      const entry: McpWrittenServerEntry = {
        transport: server.transport,
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

      config.mcpServers[server.id] = entry;
    }

    // Write the config file
    await fs.promises.writeFile(
      configPath,
      JSON.stringify(config, null, 2),
      'utf-8'
    );

    console.log(
      `[McpConfigService] Wrote MCP config to ${configPath} with ${servers.length} servers`
    );

    // Also track the config in our central location
    await this.trackConfig(projectHash, sessionId, configPath);

    return configPath;
  }

  /**
   * Remove MCP configuration file for a session
   * @param workingDir Directory containing the config
   * @param sessionId Session identifier
   * @returns True if removed, false if not found
   */
  async removeConfig(workingDir: string, sessionId: string): Promise<boolean> {
    const configPath = path.join(workingDir, '.mcp.json');

    try {
      if (fs.existsSync(configPath)) {
        // Verify this config belongs to the session before removing
        const content = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as McpWrittenConfig;

        if (config._metadata?.sessionId === sessionId) {
          await fs.promises.unlink(configPath);
          console.log(
            `[McpConfigService] Removed MCP config at ${configPath} for session ${sessionId}`
          );
          return true;
        }
      }
    } catch (error) {
      console.error(`[McpConfigService] Error removing config:`, error);
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
