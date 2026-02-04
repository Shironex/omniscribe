import { Injectable } from '@nestjs/common';
import {
  APP_NAME_LOWER,
  MCP_CONFIGS_DIR,
} from '@omniscribe/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Tracking file data structure
 */
interface TrackingData {
  sessionId: string;
  configPath: string;
  createdAt: string;
}

/**
 * Service responsible for tracking written MCP configs in a central location.
 *
 * This allows Omniscribe to find and manage all active MCP configs,
 * even when sessions use different worktrees or directories.
 */
@Injectable()
export class McpTrackingService {
  private readonly configDir: string;

  constructor() {
    // Use platform-appropriate temp directory
    this.configDir = path.join(os.tmpdir(), APP_NAME_LOWER, MCP_CONFIGS_DIR);
    this.ensureConfigDir();
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
      console.error(`[McpTrackingService] Error creating config dir:`, error);
    }
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
  async track(
    projectHash: string,
    sessionId: string,
    configPath: string
  ): Promise<void> {
    const trackingDir = this.getTrackingDir(projectHash);

    try {
      await fs.promises.mkdir(trackingDir, { recursive: true });

      const trackingFile = path.join(trackingDir, `${sessionId}.json`);
      const trackingData: TrackingData = {
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
      console.error(`[McpTrackingService] Error tracking config:`, error);
    }
  }

  /**
   * List all tracked sessions for a project
   * @param projectHash Hash of the project path
   * @returns Array of session IDs with active configs
   */
  async listSessions(projectHash: string): Promise<string[]> {
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
      console.error(`[McpTrackingService] Error listing sessions:`, error);
    }

    return sessions;
  }

  /**
   * Clean up tracking for a session
   * @param projectHash Hash of the project path
   * @param sessionId Session identifier
   */
  async cleanup(
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
      console.error(`[McpTrackingService] Error cleaning up tracking:`, error);
    }
  }

  /**
   * Get tracking data for a session
   * @param projectHash Hash of the project path
   * @param sessionId Session identifier
   * @returns Tracking data or undefined if not found
   */
  async getTrackingData(
    projectHash: string,
    sessionId: string
  ): Promise<TrackingData | undefined> {
    const trackingDir = this.getTrackingDir(projectHash);
    const trackingFile = path.join(trackingDir, `${sessionId}.json`);

    try {
      if (fs.existsSync(trackingFile)) {
        const content = await fs.promises.readFile(trackingFile, 'utf-8');
        return JSON.parse(content) as TrackingData;
      }
    } catch (error) {
      console.error(`[McpTrackingService] Error reading tracking data:`, error);
    }

    return undefined;
  }
}
