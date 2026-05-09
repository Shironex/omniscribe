import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { McpServerConfig, MCP_SERVER_NAME, createLogger, normalizePath } from '@omniscribe/shared';
import { Mutex } from 'async-mutex';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { McpInternalService } from './mcp-internal.service';
import { McpTrackingService } from './mcp-tracking.service';
import { McpSessionRegistryService } from './mcp-session-registry.service';
import { McpStatusServerService } from '../mcp-status-server.service';
import { McpCapabilityRegistryService } from './mcp-capability-registry.service';
import { McpCapabilityStateService } from './mcp-capability-state.service';
import type {
  CapabilityBuildContext,
  McpWrittenServerEntry,
} from '../capabilities/capability.types';

/**
 * Service responsible for writing MCP configuration files.
 *
 * Writes .mcp.json files to working directories with:
 * - Internal Omniscribe-managed capabilities (from the capability registry)
 * - All discovered external MCP servers from the project
 */
@Injectable()
export class McpWriterService implements OnModuleDestroy {
  private readonly logger = createLogger('McpWriterService');
  private readonly fileLocks = new Map<string, Mutex>();

  onModuleDestroy(): void {
    this.fileLocks.clear();
  }

  /**
   * Get or create a mutex for the given config file path.
   * Each unique file path gets its own lock so different files can be written in parallel.
   */
  private getMutex(configPath: string): Mutex {
    let mutex = this.fileLocks.get(configPath);
    if (!mutex) {
      mutex = new Mutex();
      this.fileLocks.set(configPath, mutex);
    }
    return mutex;
  }

  constructor(
    private readonly internalService: McpInternalService,
    private readonly trackingService: McpTrackingService,
    private readonly sessionRegistry: McpSessionRegistryService,
    private readonly statusServer: McpStatusServerService,
    private readonly capRegistry: McpCapabilityRegistryService,
    private readonly capState: McpCapabilityStateService
  ) {}

  /**
   * Generate a SHA256 hash of the project path (first 12 characters)
   * @param projectPath Full path to the project
   * @returns 12-character hex hash
   */
  generateProjectHash(projectPath: string): string {
    const normalized = normalizePath(path.normalize(projectPath)).toLowerCase();
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
    this.logger.debug(`[writeConfig] workingDir=${workingDir}, sessionId=${sessionId}`);
    const configPath = path.join(workingDir, '.mcp.json');
    const mutex = this.getMutex(configPath);

    return mutex.runExclusive(async () => {
      const projectHash = this.generateProjectHash(projectPath);

      const mcpServers: Record<string, McpWrittenServerEntry> = {};
      const managedCapabilities: string[] = [];

      // Build base context for capability builders. Per-capability fields
      // (e.g. electronCdpPort) are layered on below when resolving each cap.
      const baseCtx: CapabilityBuildContext = {
        sessionId,
        workingDir,
        projectPath,
        projectHash,
        statusUrl: this.statusServer.getStatusUrl(),
        instanceId: this.statusServer.getInstanceId(),
      };

      // Resolve enabled capabilities and write each one.
      // Discovered external servers whose id collides with a managed
      // capability are filtered out up-front so they can't overwrite a
      // managed entry — `removeConfig` would otherwise delete the user's
      // server as if Omniscribe owned it.
      const enabledIds = this.capState.getEnabled(projectPath);
      const externalIds = new Set(
        servers
          .filter(server => server.id !== MCP_SERVER_NAME && server.name !== MCP_SERVER_NAME)
          .map(server => server.id)
      );
      let omniscribeRegistered = false;

      for (const id of enabledIds) {
        const cap = this.capRegistry.get(id);
        if (!cap) {
          this.logger.warn(`Skipping unknown capability id: ${id}`);
          continue;
        }

        if (externalIds.has(cap.id)) {
          this.logger.warn(
            `Skipping capability "${cap.id}" — an external MCP server already uses that id`
          );
          continue;
        }

        const ctx: CapabilityBuildContext =
          cap.id === 'playwright-electron'
            ? { ...baseCtx, electronCdpPort: this.capState.getElectronCdpPort(projectPath) }
            : baseCtx;

        if (cap.preflight) {
          try {
            const result = await cap.preflight(ctx);
            if (!result.ok) {
              this.logger.warn(
                `Skipping capability "${id}" — preflight failed: ${result.reason ?? 'unknown reason'}`
              );
              continue;
            }
          } catch (err) {
            this.logger.warn(`Skipping capability "${id}" — preflight error: ${String(err)}`);
            continue;
          }
        }

        let entry: McpWrittenServerEntry | null;
        try {
          entry = await cap.buildConfig(ctx);
        } catch (err) {
          this.logger.error(`Failed to build capability "${id}":`, err);
          continue;
        }

        if (!entry) {
          continue;
        }

        mcpServers[cap.id] = entry;
        managedCapabilities.push(cap.id);

        // Register session for routing when omniscribe capability is enabled
        if (cap.id === MCP_SERVER_NAME && !omniscribeRegistered) {
          this.sessionRegistry.registerSession(sessionId, projectPath);
          omniscribeRegistered = true;
        }
      }

      // Build server entries for all discovered external servers
      for (const server of servers) {
        // Skip the internal omniscribe server - it's handled by the capability registry
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
          managedCapabilities,
        },
      };

      // Write the config file
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

      const serverCount = Object.keys(mcpServers).length;
      this.logger.log(
        `Wrote MCP config to ${configPath} with ${serverCount} servers ` +
          `(managed: ${managedCapabilities.length}, external: ${servers.length})`
      );

      // Also track the config in our central location
      await this.trackingService.track(projectHash, sessionId, configPath);

      return configPath;
    });
  }

  /**
   * Remove Omniscribe-managed MCP entries from a configuration file.
   * Preserves user's other MCP servers.
   *
   * Reads the `_omniscribe.managedCapabilities` meta field to know which
   * entries to remove. Falls back to removing only `MCP_SERVER_NAME` for
   * back-compat with configs written before that field existed.
   *
   * @param workingDir Directory containing the config
   * @param sessionId Session identifier for cleanup
   * @returns True if anything was removed, false otherwise
   */
  async removeConfig(workingDir: string, sessionId?: string): Promise<boolean> {
    this.logger.debug(`[removeConfig] workingDir=${workingDir}, sessionId=${sessionId ?? 'none'}`);
    // Unregister session from registry (outside mutex - separate concern)
    if (sessionId) {
      this.sessionRegistry.unregisterSession(sessionId);
    }

    const configPath = path.join(workingDir, '.mcp.json');
    const mutex = this.getMutex(configPath);

    return mutex.runExclusive(async () => {
      try {
        if (!fs.existsSync(configPath)) {
          return false;
        }

        const content = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as Record<string, unknown>;

        const mcpServers = config.mcpServers as Record<string, unknown> | undefined;
        if (!mcpServers) {
          return false;
        }

        // Determine which ids to remove. Prefer the meta marker; fall back
        // to the legacy behavior of only removing MCP_SERVER_NAME.
        //
        // Defense: cross-check every id against the live capability
        // registry before deleting anything. A user (or malicious config
        // generator) could forge `_omniscribe.managedCapabilities` to list
        // an unrelated server they want us to wipe; we only honor ids that
        // we actually know how to manage.
        const meta = config[`_${MCP_SERVER_NAME}`] as { managedCapabilities?: unknown } | undefined;
        const managed = Array.isArray(meta?.managedCapabilities)
          ? (meta!.managedCapabilities as unknown[]).filter(
              (x): x is string => typeof x === 'string'
            )
          : null;

        const knownIds = new Set(this.capRegistry.list().map(cap => cap.id));
        // The legacy MCP_SERVER_NAME entry predates the capability registry,
        // so explicitly accept it even if a custom build dropped that
        // capability from the registry.
        knownIds.add(MCP_SERVER_NAME);

        const idsToRemove =
          managed && managed.length > 0
            ? managed.filter(id => {
                if (knownIds.has(id)) return true;
                this.logger.warn(
                  `Refusing to remove "${id}" — not a known managed capability (marker forging?)`
                );
                return false;
              })
            : MCP_SERVER_NAME in mcpServers
              ? [MCP_SERVER_NAME]
              : [];

        const metaKey = `_${MCP_SERVER_NAME}`;
        const hasManagedMetadata = Object.prototype.hasOwnProperty.call(config, metaKey);

        if (idsToRemove.length === 0 && !hasManagedMetadata) {
          return false;
        }

        let removedCount = 0;
        for (const id of idsToRemove) {
          if (id in mcpServers) {
            delete mcpServers[id];
            removedCount++;
          }
        }

        if (removedCount === 0 && !hasManagedMetadata) {
          return false;
        }

        // Remove our metadata — including when a previous cleanup already
        // stripped the managed entries but left the marker behind.
        delete config[metaKey];
        delete config['_metadata']; // Legacy field

        // Write back the config with remaining servers
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

        this.logger.log(
          `Removed ${removedCount} managed entr${removedCount === 1 ? 'y' : 'ies'} from ${configPath}, ` +
            `preserved ${Object.keys(mcpServers).length} other servers`
        );

        // NOTE: Do not delete the mutex from fileLocks. Another call to
        // writeConfig/removeConfig may already be queued on this mutex;
        // removing it here would let the next getMutex() hand out a fresh
        // instance and break serialization for that configPath.
        return true;
      } catch (error) {
        this.logger.error('Error removing managed entries from config:', error);
      }

      return false;
    });
  }

  /**
   * Get the internal MCP server info
   * @returns Object with path and availability status
   */
  getInternalMcpInfo(): { available: boolean; path: string | null } {
    return this.internalService.getInternalMcpInfo();
  }
}
