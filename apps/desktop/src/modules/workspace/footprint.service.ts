import { Inject, Injectable, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  FootprintEntry,
  FootprintKind,
  FootprintRemovalResult,
  createLogger,
  extractErrorMessage,
  normalizePath,
} from '@omniscribe/shared';
import { McpWriterService } from '../mcp';
import { WorktreeService } from '../git';
import { PluginRegistryService } from '../plugin';
import { WorkspaceService } from './workspace.service';

/**
 * Minimal structural type for the Claude hook manager surface this service
 * relies on. The concrete implementation lives in `@omniscribe/provider-claude`
 * (`ClaudeHookManagerService`) and is reached through the plugin registry, so
 * we depend on the shape rather than the class to avoid a hard import of a
 * plugin package from core.
 */
interface HookManagerLike {
  detectFootprint(
    projectPath: string
  ): Promise<{ hooksPresent: boolean; hookCount: number; scriptPresent: boolean }>;
  unregisterHooks(projectPath: string): Promise<void>;
  removeHookScript(projectPath: string): Promise<boolean>;
  getHookScriptPath(projectPath: string): string;
  getSettingsPath(projectPath: string): string;
}

/** aiMode of the bundled Claude provider that owns the hook footprint. */
const CLAUDE_AI_MODE = 'claude';

/** Marker key written by McpWriterService into `.mcp.json`. */
const MCP_MANAGED_MARKER = '_omniscribe';

/** Project-local worktree directory name (mirrors WorktreeService). */
const PROJECT_WORKTREE_DIR = '.worktrees';

/**
 * FootprintService answers two questions about a project:
 *
 *  1. What has Omniscribe written into it? (`getFootprint`)
 *  2. Remove the requested, provably-owned artifacts. (`removeFootprint`)
 *
 * Plus a per-project "passive mode" flag: when on, Omniscribe writes nothing
 * into the project on session launch (MCP config / Claude hooks are skipped).
 *
 * Detection is live — it inspects the project on disk rather than trusting a
 * manifest — and every removal delegates to the service that owns the artifact
 * (McpWriterService, the Claude hook manager, WorktreeService). Nothing is
 * deleted unless it is marker- or signature-gated as Omniscribe-owned.
 */
@Injectable()
export class FootprintService {
  private readonly logger = createLogger('FootprintService');

  constructor(
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspace: WorkspaceService,
    private readonly mcpWriter: McpWriterService,
    private readonly worktreeService: WorktreeService,
    private readonly pluginRegistry: PluginRegistryService
  ) {}

  // ============================================
  // Detection
  // ============================================

  /**
   * Inspect a project and return the list of Omniscribe-owned artifacts found.
   * Each detection is gated by a marker or command signature so a foreign
   * artifact can never be reported as Omniscribe's.
   */
  async getFootprint(projectPath: string): Promise<FootprintEntry[]> {
    this.logger.debug(`[getFootprint] projectPath=${projectPath}`);
    const entries: FootprintEntry[] = [];

    // 1. Managed .mcp.json entries (marker-gated).
    const mcpEntry = await this.detectMcpConfig(projectPath);
    if (mcpEntry) entries.push(mcpEntry);

    // 2 & 3. Claude hooks + hook script (signature-gated, via the provider).
    const hookEntries = await this.detectClaudeHooks(projectPath);
    entries.push(...hookEntries);

    // 4. Project worktrees managed by Omniscribe.
    const worktreeEntry = await this.detectWorktrees(projectPath);
    if (worktreeEntry) entries.push(worktreeEntry);

    return entries;
  }

  /**
   * Detect Omniscribe-managed `.mcp.json` entries by reading the
   * `_omniscribe.managedCapabilities` marker McpWriterService writes. Returns
   * null when the file is absent, unparseable, or carries no managed marker.
   */
  private async detectMcpConfig(projectPath: string): Promise<FootprintEntry | null> {
    const configPath = path.join(projectPath, '.mcp.json');
    try {
      if (!fs.existsSync(configPath)) return null;
      const content = await fs.promises.readFile(configPath, 'utf-8');
      const config = JSON.parse(content) as Record<string, unknown>;
      const meta = config[MCP_MANAGED_MARKER] as { managedCapabilities?: unknown } | undefined;
      if (!meta) return null;

      const managed = Array.isArray(meta.managedCapabilities)
        ? (meta.managedCapabilities as unknown[]).filter((x): x is string => typeof x === 'string')
        : [];

      // Marker present but zero managed entries (e.g. all were external) still
      // counts as an Omniscribe footprint — removeConfig will strip the marker.
      const count = managed.length;
      return {
        kind: 'mcp-config',
        path: configPath,
        description:
          count > 0
            ? `${count} managed MCP ${count === 1 ? 'entry' : 'entries'} in .mcp.json`
            : 'Omniscribe marker in .mcp.json',
        count,
      };
    } catch (error) {
      this.logger.warn(
        `Failed to read .mcp.json for ${projectPath}: ${extractErrorMessage(error)}`
      );
      return null;
    }
  }

  /**
   * Detect Claude hook entries and the hook script via the provider's hook
   * manager (signature-gated). Returns up to two entries: `claude-hooks` for
   * the settings entries and `hook-script` for the script file.
   */
  private async detectClaudeHooks(projectPath: string): Promise<FootprintEntry[]> {
    const hookManager = this.getHookManager();
    if (!hookManager) return [];

    const entries: FootprintEntry[] = [];
    try {
      const result = await hookManager.detectFootprint(projectPath);
      if (result.hooksPresent) {
        entries.push({
          kind: 'claude-hooks',
          path: hookManager.getSettingsPath(projectPath),
          description: `${result.hookCount} Omniscribe ${
            result.hookCount === 1 ? 'hook' : 'hooks'
          } in .claude/settings.local.json`,
          count: result.hookCount,
        });
      }
      if (result.scriptPresent) {
        entries.push({
          kind: 'hook-script',
          path: hookManager.getHookScriptPath(projectPath),
          description: 'Omniscribe hook script (.claude/hooks/omniscribe-notify.js)',
        });
      }
    } catch (error) {
      this.logger.warn(
        `Failed to detect Claude hooks for ${projectPath}: ${extractErrorMessage(error)}`
      );
    }
    return entries;
  }

  /**
   * Detect Omniscribe-managed worktrees living under the project's
   * `.worktrees/` directory. Central worktrees are intentionally excluded —
   * footprint cleanup is scoped to artifacts written *into the project*.
   */
  private async detectWorktrees(projectPath: string): Promise<FootprintEntry | null> {
    try {
      const worktrees = await this.worktreeService.list(projectPath);
      const projectWorktreeDir = normalizePath(path.join(projectPath, PROJECT_WORKTREE_DIR));
      const managed = worktrees.filter(
        wt => !wt.isMain && normalizePath(wt.path).startsWith(projectWorktreeDir)
      );
      if (managed.length === 0) return null;
      return {
        kind: 'worktrees',
        path: path.join(projectPath, PROJECT_WORKTREE_DIR),
        description: `${managed.length} project ${
          managed.length === 1 ? 'worktree' : 'worktrees'
        } under .worktrees/`,
        count: managed.length,
      };
    } catch (error) {
      // Not a git repo (or git unavailable) — no worktree footprint.
      this.logger.debug(`No worktree footprint for ${projectPath}: ${extractErrorMessage(error)}`);
      return null;
    }
  }

  // ============================================
  // Removal
  // ============================================

  /**
   * Remove the requested footprint kinds, delegating each to its owning
   * service. Returns a per-kind result. A failure in one kind never aborts the
   * others. Unknown kinds are reported as failed rather than silently ignored.
   */
  async removeFootprint(
    projectPath: string,
    kinds: FootprintKind[]
  ): Promise<FootprintRemovalResult[]> {
    this.logger.log(`[removeFootprint] projectPath=${projectPath}, kinds=${kinds.join(',')}`);
    const results: FootprintRemovalResult[] = [];
    // De-dup while preserving order.
    const unique = Array.from(new Set(kinds));

    for (const kind of unique) {
      try {
        switch (kind) {
          case 'mcp-config':
            await this.mcpWriter.removeConfig(projectPath);
            results.push({ kind, ok: true });
            break;
          case 'claude-hooks': {
            const hookManager = this.requireHookManager();
            await hookManager.unregisterHooks(projectPath);
            results.push({ kind, ok: true });
            break;
          }
          case 'hook-script': {
            const hookManager = this.requireHookManager();
            await hookManager.removeHookScript(projectPath);
            results.push({ kind, ok: true });
            break;
          }
          case 'worktrees':
            await this.worktreeService.cleanupAll(projectPath);
            results.push({ kind, ok: true });
            break;
          default: {
            // Exhaustiveness guard: a new FootprintKind must be handled here.
            const exhaustive: never = kind;
            results.push({
              kind: exhaustive,
              ok: false,
              error: `Unknown footprint kind: ${String(exhaustive)}`,
            });
          }
        }
      } catch (error) {
        const message = extractErrorMessage(error, 'Removal failed');
        this.logger.warn(`Failed to remove "${kind}" for ${projectPath}: ${message}`);
        results.push({ kind, ok: false, error: message });
      }
    }

    return results;
  }

  // ============================================
  // Passive mode
  // ============================================

  /**
   * Whether passive mode is enabled for a project. When true, Omniscribe skips
   * writing MCP config and Claude hooks into the project on session launch.
   */
  isPassiveMode(projectPath: string): boolean {
    const map = this.workspace.get<Record<string, boolean>>(this.passiveModeKey()) ?? {};
    return map[normalizePath(projectPath)] === true;
  }

  /**
   * Enable or disable passive mode for a project. Stored in the same
   * per-project map style as projectCapabilities / projectCustomCommands.
   */
  setPassiveMode(projectPath: string, enabled: boolean): void {
    const key = normalizePath(projectPath);
    const map = this.workspace.get<Record<string, boolean>>(this.passiveModeKey()) ?? {};
    if (enabled) {
      map[key] = true;
    } else {
      delete map[key];
    }
    this.workspace.set(this.passiveModeKey(), map);
    this.logger.debug(`[setPassiveMode] project=${projectPath}, enabled=${enabled}`);
  }

  private passiveModeKey(): string {
    return 'projectPassiveMode';
  }

  // ============================================
  // Provider seam
  // ============================================

  /**
   * Resolve the Claude provider's hook manager if the provider is registered
   * and exposes one. Returns null when the provider is absent or lacks the
   * footprint surface — detection then simply reports no hook footprint.
   */
  private getHookManager(): HookManagerLike | null {
    const entry = this.pluginRegistry.getProviderEntry(CLAUDE_AI_MODE);
    const plugin = entry?.plugin as unknown as { getHookManager?: () => unknown } | undefined;
    if (!plugin || typeof plugin.getHookManager !== 'function') {
      return null;
    }
    const mgr = plugin.getHookManager() as Partial<HookManagerLike> | undefined;
    if (
      !mgr ||
      typeof mgr.detectFootprint !== 'function' ||
      typeof mgr.unregisterHooks !== 'function' ||
      typeof mgr.removeHookScript !== 'function' ||
      typeof mgr.getHookScriptPath !== 'function' ||
      typeof mgr.getSettingsPath !== 'function'
    ) {
      return null;
    }
    return mgr as HookManagerLike;
  }

  /**
   * Like getHookManager but throws when the manager is unavailable, so a
   * hook-removal request surfaces a clear error instead of silently no-op-ing.
   */
  private requireHookManager(): HookManagerLike {
    const mgr = this.getHookManager();
    if (!mgr) {
      throw new Error('Claude provider hook manager is not available');
    }
    return mgr;
  }
}
