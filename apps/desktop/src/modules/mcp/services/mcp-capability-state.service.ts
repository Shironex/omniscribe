import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { createLogger, normalizePath } from '@omniscribe/shared';
import { WorkspaceService } from '../../workspace/workspace.service';
import { McpCapabilityRegistryService } from './mcp-capability-registry.service';

/**
 * Per-project capability enable/disable state.
 *
 * Persists which capabilities are enabled for each project via
 * `WorkspaceService`. Falls back to the registry's default-enabled set
 * when no explicit state has been recorded.
 */
@Injectable()
export class McpCapabilityStateService {
  private readonly logger = createLogger('McpCapabilityStateService');

  constructor(
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspace: WorkspaceService,
    private readonly registry: McpCapabilityRegistryService
  ) {}

  /**
   * Get the enabled capability IDs for a project.
   * Returns the registry defaults if no explicit state exists.
   */
  getEnabled(projectPath: string): string[] {
    const stored = this.workspace.getProjectCapabilities(normalizePath(projectPath));
    if (stored === undefined) {
      return this.registry.defaultEnabledIds();
    }
    return stored;
  }

  /**
   * Replace the enabled capability set for a project.
   */
  setEnabled(projectPath: string, ids: string[]): void {
    this.workspace.setProjectCapabilities(normalizePath(projectPath), ids);
    this.logger.debug(`[setEnabled] project=${projectPath}, ids=${ids.join(',')}`);
  }

  /**
   * Toggle a single capability on/off and return the new enabled list.
   */
  toggle(projectPath: string, id: string, enabled: boolean): string[] {
    const current = new Set(this.getEnabled(projectPath));
    if (enabled) {
      current.add(id);
    } else {
      current.delete(id);
    }
    const next = Array.from(current);
    this.setEnabled(projectPath, next);
    return next;
  }

  /** Default CDP port assumed when the user hasn't configured one. */
  static readonly DEFAULT_ELECTRON_CDP_PORT = 9222;

  /**
   * Get the user-configured CDP port for this project's own Electron app,
   * falling back to 9222 when unset.
   */
  getElectronCdpPort(projectPath: string): number {
    const stored = this.workspace.getProjectElectronCdpPort(normalizePath(projectPath));
    return stored ?? McpCapabilityStateService.DEFAULT_ELECTRON_CDP_PORT;
  }

  /**
   * Persist the user's Electron app CDP port for a project.
   */
  setElectronCdpPort(projectPath: string, port: number): void {
    this.workspace.setProjectElectronCdpPort(normalizePath(projectPath), port);
    this.logger.debug(`[setElectronCdpPort] project=${projectPath}, port=${port}`);
  }
}
