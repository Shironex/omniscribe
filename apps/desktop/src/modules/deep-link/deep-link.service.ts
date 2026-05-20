import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { BrowserWindow, dialog } from 'electron';
import * as crypto from 'crypto';
import Store from 'electron-store';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AiMode,
  MAX_SESSION_NAME_LENGTH,
  ProjectTabDTO,
  createLogger,
  extractErrorMessage,
  normalizePath,
} from '@omniscribe/shared';
import { validatePath } from '../shared/validation';
import { PluginRegistryService } from '../plugin';
import { SessionLauncherService } from '../session/session-launcher.service';
import { WorkspaceService } from '../workspace';
import { InternalWorkspaceEvents } from '../shared/events';

interface DeepLinkStoreSchema {
  /** Project paths the user has explicitly allowed for deep-link launching. */
  streamdeckTrustedPaths: string[];
  [key: string]: unknown;
}

/**
 * Handles omniscribe://run deep links. The protocol handler in main/index.ts
 * forwards parsed URLs here. This service is the boundary where we:
 *   1. Validate the URL payload.
 *   2. Decide whether the project path is trusted (auto-trust workspace
 *      projects + a user-managed allowlist; prompt otherwise).
 *   3. Surface a tab and delegate to SessionLauncherService.
 */
@Injectable()
export class DeepLinkService {
  private readonly logger = createLogger('DeepLinkService');
  private readonly store: Store<DeepLinkStoreSchema>;

  constructor(
    private readonly sessionLauncher: SessionLauncherService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly events: EventEmitter2,
    @Inject(forwardRef(() => WorkspaceService))
    private readonly workspaceService: WorkspaceService
  ) {
    this.store = new Store<DeepLinkStoreSchema>({
      name: 'deep-link',
      defaults: { streamdeckTrustedPaths: [] },
    });
  }

  /**
   * Parse and execute an omniscribe://run URL.
   * Resolves once the launch is attempted; failures are logged but do not throw.
   */
  async handleRun(url: string): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      this.logger.warn('Deep link: invalid URL');
      return;
    }

    if (parsed.protocol !== 'omniscribe:') return;

    const projectPath = parsed.searchParams.get('project');
    const provider = parsed.searchParams.get('provider');
    const branch = parsed.searchParams.get('branch') ?? undefined;
    const name = parsed.searchParams.get('name') ?? undefined;

    if (!projectPath || !provider) {
      this.logger.warn('Deep link: missing project or provider');
      return;
    }

    const pathError = validatePath(projectPath);
    if (pathError) {
      this.logger.warn(`Deep link: ${pathError}`);
      return;
    }

    if (!this.pluginRegistry.isValidMode(provider)) {
      this.logger.warn(`Deep link: unknown provider '${provider}'`);
      return;
    }

    if (name && name.length > MAX_SESSION_NAME_LENGTH) {
      this.logger.warn('Deep link: session name too long');
      return;
    }

    const trusted = await this.ensureTrusted(projectPath);
    if (!trusted) {
      this.logger.log(`Deep link: user denied launch for ${projectPath}`);
      return;
    }

    // Use the existing tab's path verbatim when one matches, so the session's
    // projectPath string matches downstream `===` comparisons in the renderer.
    // Without this, a tab added via the UI ("X:\\dev\\omniscribe") and a URL
    // path ("X:/dev/omniscribe") normalize-equal but filter-unequal — and the
    // deep-link session ends up invisible.
    const effectivePath = this.resolveCanonicalPath(projectPath);
    this.ensureTab(effectivePath);

    const outcome = await this.sessionLauncher.launch({
      projectPath: effectivePath,
      mode: provider as AiMode,
      branch,
      name,
      source: 'deeplink',
    });

    if (outcome.error) {
      this.logger.warn(`Deep link launch failed: ${outcome.error}`);
      return;
    }
    if (outcome.worktreeWarning) {
      this.logger.warn(`Deep link launch worktree warning: ${outcome.worktreeWarning}`);
    }
    this.logger.log(
      `Deep link launched session ${outcome.session?.id ?? '<unknown>'} for ${projectPath} (${provider})`
    );
  }

  /**
   * Return true if the project path is known (existing workspace tab) or
   * explicitly trusted; otherwise prompt the user with a native dialog and
   * honor their choice. The allowlist persists "Allow always" decisions.
   */
  private async ensureTrusted(projectPath: string): Promise<boolean> {
    const normalized = normalizePath(projectPath);

    const existingTabs = this.workspaceService.getTabs();
    if (existingTabs.some(t => normalizePath(t.projectPath) === normalized)) {
      return true;
    }

    const trusted = this.store.get('streamdeckTrustedPaths', []);
    if (trusted.some(p => normalizePath(p) === normalized)) {
      return true;
    }

    return this.promptUser(projectPath, normalized);
  }

  private async promptUser(projectPath: string, normalized: string): Promise<boolean> {
    const window = BrowserWindow.getAllWindows()[0];
    const opts = {
      type: 'question' as const,
      buttons: ['Allow once', 'Allow always', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Stream Deck launch',
      message: 'Launch new project from Stream Deck?',
      detail: `Omniscribe has never seen this path before:\n\n${projectPath}\n\nAllow this launch?`,
    };

    const result = window
      ? await dialog.showMessageBox(window, opts)
      : await dialog.showMessageBox(opts);

    if (result.response === 2) return false;

    if (result.response === 1) {
      const trusted = this.store.get('streamdeckTrustedPaths', []);
      trusted.push(projectPath);
      this.store.set('streamdeckTrustedPaths', trusted);
      this.logger.log(`Deep link: added ${normalized} to streamdeckTrustedPaths`);
    }

    return true;
  }

  /**
   * Make sure a tab exists for this project so the UI surfaces a destination
   * for the session. Reuses WorkspaceService.addTab's existing dedupe logic.
   */
  private ensureTab(projectPath: string): void {
    const normalized = normalizePath(projectPath);
    const existing = this.workspaceService.getTabs();
    const alreadyOpen = existing.some(t => normalizePath(t.projectPath) === normalized);

    if (!alreadyOpen) {
      const tab: ProjectTabDTO = {
        id: crypto.randomUUID(),
        projectPath,
        name: this.basename(projectPath),
        sessionIds: [],
        isActive: true,
        lastAccessedAt: new Date().toISOString(),
      };

      try {
        this.workspaceService.addTab(tab);
      } catch (error) {
        this.logger.warn(`Deep link: failed to add tab: ${extractErrorMessage(error)}`);
        return;
      }
    } else {
      // Bring the existing tab to the front so the launching session is visible.
      const target = existing.find(t => normalizePath(t.projectPath) === normalized);
      if (target) this.workspaceService.setActiveTabId(target.id);
    }

    // The gateway broadcasts TABS_UPDATED on the user-driven path. Deep links
    // bypass it, so emit an internal event the gateway can fan out to all
    // connected renderers.
    this.events.emit(InternalWorkspaceEvents.TABS_UPDATED, {
      tabs: this.workspaceService.getTabs(),
      activeTabId: this.workspaceService.getActiveTabId(),
    });
  }

  private resolveCanonicalPath(incoming: string): string {
    const normalized = normalizePath(incoming);
    const match = this.workspaceService
      .getTabs()
      .find(t => normalizePath(t.projectPath) === normalized);
    if (match) return match.projectPath;
    // No existing tab — pick the OS-native separator so future === comparisons
    // line up with paths produced by Node's path module elsewhere in the app.
    return process.platform === 'win32' ? incoming.replace(/\//g, '\\') : incoming;
  }

  private basename(p: string): string {
    const cleaned = p.replace(/[\\/]+$/, '');
    const idx = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
    return idx === -1 ? cleaned : cleaned.slice(idx + 1);
  }
}
