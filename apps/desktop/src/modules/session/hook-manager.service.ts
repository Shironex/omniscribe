import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger, extractErrorMessage, normalizePath } from '@omniscribe/shared';
import { InternalSessionEvents } from '../shared/events';

/**
 * Hook event data parsed from the JSON file written by the hook script
 */
interface HookEventData {
  hook_event_name?: string;
  session_id?: string;
  [key: string]: unknown;
}

/**
 * Hook script template that reads hook JSON from stdin and writes to a temp directory
 */
const HOOK_SCRIPT = `const fs = require('fs');
const path = require('path');
const os = require('os');
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  const dir = path.join(os.tmpdir(), 'omniscribe-hooks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, \`\${Date.now()}-\${process.pid}.json\`), data);
});
`;

/**
 * Hook configuration entry for Claude Code's settings.local.json
 */
interface ClaudeHookEntry {
  type: string;
  command: string;
  timeout: number;
  async: boolean;
}

interface ClaudeHookMatcher {
  hooks: ClaudeHookEntry[];
}

interface ClaudeSettingsLocal {
  hooks?: {
    SessionStart?: ClaudeHookMatcher[];
    SessionEnd?: ClaudeHookMatcher[];
    [key: string]: ClaudeHookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

/**
 * Service responsible for registering Claude Code hooks and watching for hook events.
 *
 * Hooks are registered in the project's `.claude/settings.local.json` and use a small
 * Node.js script that writes hook data to a temp directory. This service watches that
 * directory for new files and emits events when hooks fire.
 */
@Injectable()
export class HookManagerService implements OnModuleDestroy {
  private readonly logger = createLogger('HookManagerService');
  private watcher: fs.FSWatcher | null = null;
  private readonly hookDir = path.join(os.tmpdir(), 'omniscribe-hooks');
  private processedFiles = new Set<string>();
  private static readonly MAX_PROCESSED_FILES = 10_000;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleDestroy(): void {
    this.stopWatching();
  }

  /**
   * Register Omniscribe hooks in the project's .claude/settings.local.json.
   * Creates the hook script file and merges hook entries into the settings file,
   * preserving any existing hooks.
   */
  async registerHooks(projectPath: string): Promise<void> {
    try {
      // Create hook script
      const claudeDir = path.join(projectPath, '.claude');
      const hooksDir = path.join(claudeDir, 'hooks');
      await fs.promises.mkdir(hooksDir, { recursive: true });

      const scriptPath = path.join(hooksDir, 'omniscribe-notify.js');
      await fs.promises.writeFile(scriptPath, HOOK_SCRIPT, 'utf-8');
      this.logger.debug(`Wrote hook script to ${scriptPath}`);

      // Read existing settings.local.json
      const settingsPath = path.join(claudeDir, 'settings.local.json');
      let settings: ClaudeSettingsLocal = {};

      try {
        const content = await fs.promises.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        // File doesn't exist or is invalid — start fresh
      }

      // Build hook command
      const hookCommand = `node "${normalizePath(scriptPath)}"`;

      const omniscribeHook: ClaudeHookEntry = {
        type: 'command',
        command: hookCommand,
        timeout: 5,
        async: true,
      };

      // Merge hooks (preserving existing ones)
      if (!settings.hooks) {
        settings.hooks = {};
      }

      for (const eventName of ['SessionStart', 'SessionEnd'] as const) {
        const existing = settings.hooks[eventName] ?? [];

        // Check if our hook is already registered
        const alreadyRegistered = existing.some(matcher =>
          matcher.hooks?.some(h => h.command === hookCommand)
        );

        if (!alreadyRegistered) {
          existing.push({ hooks: [omniscribeHook] });
          settings.hooks[eventName] = existing;
          this.logger.debug(`Registered ${eventName} hook for ${projectPath}`);
        }
      }

      await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      this.logger.info(`Hooks registered in ${settingsPath}`);
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to register hooks for ${projectPath}: ${msg}`);
    }
  }

  /**
   * Remove Omniscribe hooks from the project's .claude/settings.local.json.
   */
  async unregisterHooks(projectPath: string): Promise<void> {
    try {
      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json');

      let settings: ClaudeSettingsLocal;
      try {
        const content = await fs.promises.readFile(settingsPath, 'utf-8');
        settings = JSON.parse(content);
      } catch {
        return; // No settings file — nothing to unregister
      }

      if (!settings.hooks) return;

      const scriptPath = normalizePath(
        path.join(projectPath, '.claude', 'hooks', 'omniscribe-notify.js')
      );
      const hookCommand = `node "${scriptPath}"`;

      let changed = false;
      for (const eventName of ['SessionStart', 'SessionEnd'] as const) {
        const existing = settings.hooks[eventName];
        if (!existing) continue;

        const filtered = existing.filter(
          matcher => !matcher.hooks?.some(h => h.command === hookCommand)
        );

        if (filtered.length !== existing.length) {
          settings.hooks[eventName] = filtered.length > 0 ? filtered : undefined;
          changed = true;
        }
      }

      if (changed) {
        await fs.promises.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        this.logger.info(`Hooks unregistered from ${settingsPath}`);
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to unregister hooks for ${projectPath}: ${msg}`);
    }
  }

  /**
   * Start watching the temp directory for hook event files.
   * Emits `session.hook.start` and `session.hook.end` events.
   */
  startWatching(): void {
    if (this.watcher) return;

    try {
      // Ensure the hook directory exists
      fs.mkdirSync(this.hookDir, { recursive: true });

      this.watcher = fs.watch(this.hookDir, (eventType, filename) => {
        if (eventType !== 'rename' || !filename || !filename.endsWith('.json')) return;
        if (this.processedFiles.has(filename)) return;
        this.processedFiles.add(filename);

        // Prevent unbounded growth — evict oldest entries (Set preserves insertion order)
        if (this.processedFiles.size > HookManagerService.MAX_PROCESSED_FILES) {
          const excess = this.processedFiles.size - HookManagerService.MAX_PROCESSED_FILES;
          let removed = 0;
          for (const entry of this.processedFiles) {
            if (removed >= excess) break;
            this.processedFiles.delete(entry);
            removed++;
          }
        }

        // Read and process the hook event file
        const filePath = path.join(this.hookDir, filename);
        this.processHookFile(filePath);
      });

      this.logger.info(`Watching for hook events in ${this.hookDir}`);
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to start watching hook directory: ${msg}`);
    }
  }

  /**
   * Stop watching for hook events and clean up.
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.processedFiles.clear();
      this.logger.debug('Stopped watching hook directory');
    }
  }

  /**
   * Process a single hook event file.
   */
  private async processHookFile(filePath: string): Promise<void> {
    try {
      // Small delay to ensure the file is fully written
      await new Promise<void>(resolve => setTimeout(resolve, 100));

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data: HookEventData = JSON.parse(content);

      // Clean up the file after reading
      await fs.promises.unlink(filePath).catch(() => {});

      if (data.hook_event_name === 'SessionStart') {
        this.eventEmitter.emit(InternalSessionEvents.HOOK_START, data);
        this.logger.debug('Hook event: SessionStart', data.session_id);
      } else if (data.hook_event_name === 'SessionEnd') {
        this.eventEmitter.emit(InternalSessionEvents.HOOK_END, data);
        this.logger.debug('Hook event: SessionEnd', data.session_id);
      } else {
        // Generic hook event
        this.logger.debug('Hook event (unknown type):', data);
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to process hook file ${filePath}: ${msg}`);
    }
  }
}
