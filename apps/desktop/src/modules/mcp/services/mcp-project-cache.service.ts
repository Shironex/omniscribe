import { Injectable } from '@nestjs/common';
import { McpServerConfig } from '@omniscribe/shared';

/**
 * Service responsible for caching discovered MCP servers per project.
 *
 * This avoids re-discovering servers on every request and allows
 * quick access to the server list from the gateway.
 */
@Injectable()
export class McpProjectCacheService {
  /** Map of project paths to their discovered servers */
  private projectServers = new Map<string, McpServerConfig[]>();

  /**
   * Set cached servers for a project
   * @param projectPath Project path
   * @param servers Array of server configurations
   */
  setServers(projectPath: string, servers: McpServerConfig[]): void {
    this.projectServers.set(projectPath, servers);
    console.log(
      `[McpProjectCache] Cached ${servers.length} servers for ${projectPath}`
    );
  }

  /**
   * Get cached servers for a project
   * @param projectPath Project path
   * @returns Array of server configurations (empty if not cached)
   */
  getServers(projectPath: string): McpServerConfig[] {
    return this.projectServers.get(projectPath) ?? [];
  }

  /**
   * Check if servers are cached for a project
   * @param projectPath Project path
   * @returns True if servers are cached
   */
  hasServers(projectPath: string): boolean {
    return this.projectServers.has(projectPath);
  }

  /**
   * Clear cached servers for a project
   * @param projectPath Project path
   */
  clearServers(projectPath: string): void {
    if (this.projectServers.delete(projectPath)) {
      console.log(`[McpProjectCache] Cleared cache for ${projectPath}`);
    }
  }

  /**
   * Clear all cached servers
   */
  clearAll(): void {
    this.projectServers.clear();
    console.log('[McpProjectCache] Cleared all cached servers');
  }
}
