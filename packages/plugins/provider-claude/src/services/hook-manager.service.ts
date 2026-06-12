/**
 * Claude Hook Manager Service
 *
 * Registers and watches for Claude Code hooks that notify Omniscribe of
 * session lifecycle events. Two complementary channels are installed:
 *
 *  1. **Tmpdir channel** (SessionStart/SessionEnd): a small Node script writes
 *     the hook JSON to a temp directory that this service watches. Used for
 *     lifecycle correlation (capturing the Claude session id, etc.).
 *
 *  2. **OSC marker channel** (UserPromptSubmit/Notification/Stop): the hook
 *     returns an `OSC 777;notify;omniscribe;<event>` escape sequence via Claude
 *     Code's `terminalSequence` hook-output field. The sequence rides the PTY
 *     output stream and is picked up by `OscAgentDetector`, driving the
 *     session's working / needs_input / finished status. This works in bash,
 *     Windows, tmux, and wrapper setups where no shell preexec fires, because
 *     the marker self-arms the detector. Gated on `OMNISCRIBE_SESSION_ID` so it
 *     is a no-op outside an Omniscribe-managed terminal.
 *
 * Both channels are written into the same `.claude/settings.local.json` with
 * terax-grade safety: atomic temp+rename writes, never clobbering unparseable
 * JSON, preserving foreign hooks, and idempotent re-install.
 *
 * Extracted from apps/desktop/src/modules/session/hook-manager.service.ts.
 * Pure TypeScript class with no NestJS dependencies. Uses a callback pattern
 * instead of NestJS EventEmitter2 for hook event notification.
 *
 * The OSC marker channel and its safety properties are adapted from terax-ai
 * (Apache-2.0) — `src-tauri/src/modules/agent.rs`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger, extractErrorMessage, normalizePath } from '@omniscribe/shared';

/**
 * Hook event data parsed from the JSON file written by the hook script
 */
export interface HookEventData {
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
 * OSC-marker hook events. Each Claude Code hook event maps to an Omniscribe
 * agent-status event carried by the OSC 777 marker.
 */
const OSC_HOOK_EVENTS = [
  ['UserPromptSubmit', 'working'],
  ['Notification', 'attention'],
  ['Stop', 'finished'],
] as const;

/**
 * Substring that identifies a hook command as owned by Omniscribe's OSC marker
 * channel. Used to strip/replace only our entries on re-install and removal.
 */
const OSC_OWNED_MARKER = 'notify;omniscribe;';

/**
 * Build the shell command for an OSC-marker hook.
 *
 * Gated on `OMNISCRIBE_SESSION_ID` so it is inert outside an Omniscribe
 * terminal. Emits the marker via Claude Code's `terminalSequence` hook-output
 * field (hooks lost direct `/dev/tty` access in newer Claude Code), where
 * `]777;notify;omniscribe;<event>` is BEL-terminated. The `|| true`
 * keeps a non-Omniscribe shell from surfacing a non-zero exit.
 */
function oscHookCommand(event: string): string {
  return `[ -n "$OMNISCRIBE_SESSION_ID" ] && printf '{"terminalSequence":"\\u001b]777;notify;omniscribe;${event}\\u0007"}' || true`;
}

/**
 * Hook configuration entry for Claude Code's settings.local.json.
 * `timeout` / `async` are optional — the OSC-marker entries omit them.
 */
interface ClaudeHookEntry {
  type: string;
  command: string;
  timeout?: number;
  async?: boolean;
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
 * Callback type for hook event notification.
 * The core adapter bridges this callback to the NestJS event system.
 */
export type HookEventCallback = (event: HookEventData) => void;

/**
 * Service responsible for registering Claude Code hooks and watching for hook events.
 *
 * Hooks are registered in the project's `.claude/settings.local.json` and use a small
 * Node.js script that writes hook data to a temp directory. This service watches that
 * directory for new files and calls the registered callback when hooks fire.
 */
export class ClaudeHookManagerService {
  private readonly logger = createLogger('HookManagerService');
  private watcher: fs.FSWatcher | null = null;
  private readonly hookDir = path.join(os.tmpdir(), 'omniscribe-hooks');
  private processedFiles = new Set<string>();
  private static readonly MAX_PROCESSED_FILES = 10_000;

  /** Optional callback invoked when hook events are detected */
  private hookCallback: HookEventCallback | null = null;

  /**
   * Set the callback invoked when hook events (SessionStart, SessionEnd) are detected.
   * The core adapter uses this to bridge hook events into the NestJS event system.
   */
  setHookCallback(cb: HookEventCallback): void {
    this.hookCallback = cb;
  }

  /**
   * Clean up all resources (file watcher).
   * Callers must invoke this when the service is no longer needed.
   */
  destroy(): void {
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

      // Read existing settings.local.json. A file that exists but is
      // unparseable is NOT clobbered — abort the merge so we never destroy a
      // user's (or another tool's) settings (terax safety property).
      const settingsPath = path.join(claudeDir, 'settings.local.json');
      const settings = await this.readSettings(settingsPath);
      if (settings === null) {
        this.logger.warn(
          `Refusing to register hooks: ${settingsPath} is not valid JSON (won't clobber)`
        );
        return;
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

      // Channel 1: tmpdir lifecycle hooks (SessionStart/SessionEnd).
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

      // Channel 2: OSC 777 marker hooks (UserPromptSubmit/Notification/Stop).
      // Idempotent: strip any prior Omniscribe OSC entries (and inert empty
      // groups) before re-adding, so re-install never accumulates duplicates
      // while foreign hooks are preserved.
      for (const [eventName, event] of OSC_HOOK_EVENTS) {
        const existing = settings.hooks[eventName] ?? [];
        const preserved = existing.filter(
          matcher => !this.isOscOwned(matcher) && !this.isEmptyGroup(matcher)
        );
        preserved.push({
          hooks: [{ type: 'command', command: oscHookCommand(event) }],
        });
        settings.hooks[eventName] = preserved;
        this.logger.debug(`Registered ${eventName} OSC marker hook for ${projectPath}`);
      }

      // Atomic write: serialize to a sibling temp file then rename, so a crash
      // mid-write can't leave a truncated settings.local.json.
      await this.atomicWriteJson(settingsPath, settings);
      this.logger.info(`Hooks registered in ${settingsPath}`);
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to register hooks for ${projectPath}: ${msg}`);
    }
  }

  /**
   * Read settings.local.json into an object.
   *
   * @returns `{}` when the file is absent or empty (fresh start), the parsed
   *   object when valid, or `null` when the file exists but is unparseable —
   *   the caller must refuse to overwrite in that case.
   */
  private async readSettings(settingsPath: string): Promise<ClaudeSettingsLocal | null> {
    let content: string;
    try {
      content = await fs.promises.readFile(settingsPath, 'utf-8');
    } catch {
      // Absent (or unreadable) → start fresh.
      return {};
    }
    if (content.trim().length === 0) {
      return {};
    }
    try {
      const parsed = JSON.parse(content);
      // A non-object root (array, string, number) is also unsafe to merge into.
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      return parsed as ClaudeSettingsLocal;
    } catch {
      return null;
    }
  }

  /** True when a hook group is owned by Omniscribe's OSC marker channel. */
  private isOscOwned(matcher: ClaudeHookMatcher): boolean {
    return !!matcher.hooks?.some(
      h => typeof h.command === 'string' && h.command.includes(OSC_OWNED_MARKER)
    );
  }

  /**
   * True when a hook group carries no hooks. Such groups are inert cruft (e.g.
   * left behind when someone deletes a command but not its wrapper) — drop them
   * so the file stays clean.
   */
  private isEmptyGroup(matcher: ClaudeHookMatcher): boolean {
    return !matcher.hooks || matcher.hooks.length === 0;
  }

  /**
   * Atomically write JSON: write to a sibling temp file, then rename over the
   * target. On rename failure the temp file is cleaned up.
   */
  private async atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
    const out = JSON.stringify(value, null, 2);
    const tmpPath = `${targetPath}.omniscribe-tmp`;
    await fs.promises.writeFile(tmpPath, out, 'utf-8');
    try {
      await fs.promises.rename(tmpPath, targetPath);
    } catch (error) {
      await fs.promises.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }

  /**
   * Remove Omniscribe hooks from the project's .claude/settings.local.json.
   */
  async unregisterHooks(projectPath: string): Promise<void> {
    try {
      const settingsPath = path.join(projectPath, '.claude', 'settings.local.json');

      const settings = await this.readSettings(settingsPath);
      if (settings === null) {
        // Unparseable — leave it alone rather than risk destroying it.
        this.logger.warn(
          `Refusing to unregister hooks: ${settingsPath} is not valid JSON (won't clobber)`
        );
        return;
      }

      if (!settings.hooks) return;

      const scriptPath = normalizePath(
        path.join(projectPath, '.claude', 'hooks', 'omniscribe-notify.js')
      );
      const hookCommand = `node "${scriptPath}"`;

      let changed = false;

      // Channel 1: tmpdir lifecycle hooks (matched by exact command).
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

      // Channel 2: OSC marker hooks (matched by owned marker substring).
      for (const [eventName] of OSC_HOOK_EVENTS) {
        const existing = settings.hooks[eventName];
        if (!existing) continue;

        const filtered = existing.filter(matcher => !this.isOscOwned(matcher));

        if (filtered.length !== existing.length) {
          settings.hooks[eventName] = filtered.length > 0 ? filtered : undefined;
          changed = true;
        }
      }

      if (changed) {
        await this.atomicWriteJson(settingsPath, settings);
        this.logger.info(`Hooks unregistered from ${settingsPath}`);
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to unregister hooks for ${projectPath}: ${msg}`);
    }
  }

  /**
   * Start watching the temp directory for hook event files.
   * Calls the registered hookCallback when events are detected.
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

        // Prevent unbounded growth -- evict oldest entries (Set preserves insertion order)
        if (this.processedFiles.size > ClaudeHookManagerService.MAX_PROCESSED_FILES) {
          const excess = this.processedFiles.size - ClaudeHookManagerService.MAX_PROCESSED_FILES;
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
   * Calls the hookCallback instead of emitting NestJS events.
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
        this.hookCallback?.(data);
        this.logger.debug('Hook event: SessionStart', data.session_id);
      } else if (data.hook_event_name === 'SessionEnd') {
        this.hookCallback?.(data);
        this.logger.debug('Hook event: SessionEnd', data.session_id);
      } else {
        // Generic hook event -- still notify callback
        this.hookCallback?.(data);
        this.logger.debug('Hook event (unknown type):', data);
      }
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.warn(`Failed to process hook file ${filePath}: ${msg}`);
    }
  }
}
