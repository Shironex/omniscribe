import { Injectable, Logger } from '@nestjs/common';
import {
  APP_NAME_LOWER,
  MCP_SERVER_DIR,
} from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Internal MCP server info
 */
export interface InternalMcpInfo {
  /** Whether the internal MCP server is available */
  available: boolean;
  /** Path to the internal MCP server binary */
  path: string | null;
}

/**
 * Service responsible for finding and providing info about the internal
 * Omniscribe MCP server binary.
 *
 * The internal MCP server is used to report session status back to
 * Omniscribe from Claude Code.
 */
@Injectable()
export class McpInternalService {
  private readonly logger = new Logger(McpInternalService.name);
  private readonly internalMcpPath: string | null;

  constructor() {
    // Find the internal MCP server binary on startup
    this.internalMcpPath = this.findInternalMcp();
    if (this.internalMcpPath) {
      this.logger.log(`Found internal MCP server at: ${this.internalMcpPath}`);
    } else {
      this.logger.warn('Internal MCP server not found - status updates will be unavailable');
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
      path.join(__dirname, '..', '..', '..', '..', '..', 'mcp-server', 'dist', 'index.js')
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
      candidates.push(path.join(resourcesPath, MCP_SERVER_DIR, 'index.js'));
    }

    // 4. Global install locations
    if (isWindows) {
      candidates.push(
        path.join(os.homedir(), 'AppData', 'Local', APP_NAME_LOWER, MCP_SERVER_DIR, 'index.js')
      );
    } else {
      candidates.push(`/usr/local/lib/${APP_NAME_LOWER}/${MCP_SERVER_DIR}/index.js`);
      candidates.push(
        path.join(os.homedir(), '.local', 'lib', APP_NAME_LOWER, MCP_SERVER_DIR, 'index.js')
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
  getInternalMcpInfo(): InternalMcpInfo {
    return {
      available: this.internalMcpPath !== null,
      path: this.internalMcpPath,
    };
  }

  /**
   * Get the path to the internal MCP server
   * @returns Path or null if not available
   */
  getPath(): string | null {
    return this.internalMcpPath;
  }

  /**
   * Check if the internal MCP server is available
   * @returns True if available
   */
  isAvailable(): boolean {
    return this.internalMcpPath !== null;
  }
}
