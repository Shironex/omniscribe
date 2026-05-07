/**
 * Claude Session Reader Service
 *
 * Reads Claude Code's session data from the filesystem, including session
 * index parsing and JSONL file scanning. Supports filesystem watching for
 * real-time session list updates.
 *
 * Extracted from apps/desktop/src/modules/session/claude-session-reader.service.ts.
 * Pure TypeScript class with no NestJS dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  ClaudeSessionEntry,
  ClaudeSessionsIndex,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { getClaudeSessionsDir, getSessionsIndexPath } from '@omniscribe/shared/node';
import type { ProviderSessionEntry } from '@omniscribe/plugin-api';

/**
 * Parsed fields from a .jsonl line
 */
interface JsonlLineData {
  sessionId?: string;
  gitBranch?: string;
  timestamp?: string;
  type?: string;
  isSidechain?: boolean;
  cwd?: string;
  customTitle?: string;
  message?: { role?: string; content?: string | Array<{ type: string; text?: string }> };
}

/**
 * Service for reading Claude Code's session data from the filesystem.
 *
 * Claude Code stores session metadata at:
 *   ~/.claude/projects/<encoded-path>/sessions-index.json
 *
 * However, sessions-index.json is often stale (not updated in real-time).
 * This service supplements it by scanning .jsonl files directly so that
 * recent sessions always appear in the history.
 */
export class ClaudeSessionReaderService {
  private readonly logger = createLogger('ClaudeSessionReaderService');

  /** Active file watchers keyed by project path, for cleanup on destroy */
  private watchers = new Map<string, fs.FSWatcher>();

  /** Cache of customTitle keyed by "<sessionId>:<fileMtime>" to avoid re-reads */
  private customTitleCache = new Map<string, string>();

  /**
   * Clean up all resources (file watchers).
   * Callers must invoke this when the service is no longer needed.
   */
  destroy(): void {
    for (const [projectPath, watcher] of this.watchers.entries()) {
      this.logger.debug(`Closing watcher for ${projectPath}`);
      watcher.close();
    }
    this.watchers.clear();
    this.customTitleCache.clear();
  }

  /**
   * Read session entries for a given project path.
   *
   * Uses sessions-index.json as base data, then supplements with .jsonl files
   * that are missing from the index (which is often stale). Returns entries
   * sorted by modified date (newest first), filtering out sidechains.
   */
  async readSessionsIndex(projectPath: string): Promise<ClaudeSessionEntry[]> {
    const sessionsDir = getClaudeSessionsDir(projectPath);
    const indexPath = getSessionsIndexPath(projectPath);

    // Step 1: Read sessions-index.json (may be stale/empty)
    let indexEntries: ClaudeSessionEntry[] = [];
    try {
      const content = await this.readFileWithRetry(indexPath);
      if (content) {
        const index = this.parseSessionsIndex(content, indexPath);
        if (index) {
          indexEntries = index.entries;
        }
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.warn(`Failed to read sessions index: ${errorMessage}`);
    }

    // Step 2: Scan for .jsonl files not already in the index
    const indexedIds = new Set(indexEntries.map(e => e.sessionId));
    let scannedEntries: ClaudeSessionEntry[] = [];

    try {
      scannedEntries = await this.scanJsonlFiles(sessionsDir, indexedIds, projectPath);
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.warn(`Failed to scan .jsonl files: ${errorMessage}`);
    }

    // Step 3: Merge — scanned entries already have customTitle from JSONL scan.
    // For index entries (which come from sessions-index.json and never carry customTitle),
    // do a lazy single-pass JSONL read to populate the field.
    const populatedIndexEntries = await Promise.all(
      indexEntries.map(entry => this.populateCustomTitle(entry, sessionsDir))
    );

    const allEntries = [...populatedIndexEntries, ...scannedEntries];
    return this.filterAndSort(allEntries);
  }

  /**
   * Watch sessions-index.json for changes.
   * Calls the callback whenever the file is modified.
   * Returns a cleanup function to stop watching.
   */
  watchSessionsIndex(
    projectPath: string,
    callback: (entries: ClaudeSessionEntry[]) => void
  ): () => void {
    const indexPath = getSessionsIndexPath(projectPath);
    const dir = path.dirname(indexPath);
    const filename = path.basename(indexPath);

    // Close any existing watcher for this project
    const existing = this.watchers.get(projectPath);
    if (existing) {
      this.logger.debug(`Replacing existing watcher for ${projectPath}`);
      existing.close();
      this.watchers.delete(projectPath);
    }

    // Debounce timer to coalesce rapid writes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const DEBOUNCE_MS = 300;

    const handleChange = (): void => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(async () => {
        debounceTimer = null;
        try {
          const entries = await this.readSessionsIndex(projectPath);
          callback(entries);
        } catch (error) {
          this.logger.error(`Watcher callback error for ${projectPath}`, error);
        }
      }, DEBOUNCE_MS);
    };

    try {
      // Ensure the directory exists before watching
      if (!fs.existsSync(dir)) {
        this.logger.debug(
          `Sessions directory does not exist yet: ${dir}. Will watch parent for creation.`
        );
        // Return a no-op cleanup since there's nothing to watch yet
        return () => {};
      }

      const watcher = fs.watch(dir, (_eventType, changedFilename) => {
        // Only react to changes on the sessions-index.json file
        if (changedFilename === filename) {
          handleChange();
        }
      });

      watcher.on('error', (error: Error) => {
        this.logger.error(`File watcher error for ${projectPath}`, error);
      });

      this.watchers.set(projectPath, watcher);

      this.logger.debug(`Watching sessions index for ${projectPath} at ${dir}`);

      // Return cleanup function
      return () => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        watcher.close();
        this.watchers.delete(projectPath);
        this.logger.debug(`Stopped watching sessions index for ${projectPath}`);
      };
    } catch (error) {
      this.logger.error(`Failed to set up watcher for ${projectPath}`, error);
      return () => {};
    }
  }

  /**
   * Find a newly created session by comparing current index entries
   * against a snapshot of previous entries.
   * Used to detect which Claude session was created after we spawned a CLI process.
   */
  async findNewSession(
    projectPath: string,
    previousSessionIds: Set<string>
  ): Promise<ClaudeSessionEntry | null> {
    const entries = await this.readSessionsIndex(projectPath);

    // Find entries whose sessionId is NOT in the previous set
    const newEntries = entries.filter(entry => !previousSessionIds.has(entry.sessionId));

    if (newEntries.length === 0) {
      return null;
    }

    // Return the newest one (entries are already sorted newest-first)
    return newEntries[0];
  }

  /**
   * Read session history and map to ProviderSessionEntry format.
   *
   * This wraps readSessionsIndex() and maps Claude-specific ClaudeSessionEntry
   * to the provider-agnostic ProviderSessionEntry interface from the plugin API.
   */
  async readSessionHistory(projectPath: string): Promise<ProviderSessionEntry[]> {
    const entries = await this.readSessionsIndex(projectPath);

    return entries.map(entry => ({
      sessionId: entry.sessionId,
      projectPath: entry.projectPath,
      summary: entry.customTitle || entry.summary || entry.firstPrompt || undefined,
      messageCount: entry.messageCount || undefined,
      created: entry.created,
      modified: entry.modified,
      metadata: {
        fullPath: entry.fullPath,
        gitBranch: entry.gitBranch,
        isSidechain: entry.isSidechain,
        fileMtime: entry.fileMtime,
        customTitle: entry.customTitle,
      },
    }));
  }

  /**
   * Scan the sessions directory for .jsonl files not in the index.
   * Reads the first few lines of each file to extract session metadata.
   * Limits to 50 most recently modified files for performance.
   */
  private async scanJsonlFiles(
    sessionsDir: string,
    indexedIds: Set<string>,
    projectPath: string
  ): Promise<ClaudeSessionEntry[]> {
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = await fs.promises.readdir(sessionsDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw error;
    }

    // Collect .jsonl files
    const jsonlFiles = dirEntries.filter(
      e => e.isFile() && e.name.endsWith('.jsonl') && e.name !== 'sessions-index.json'
    );

    // Extract session IDs from filenames and filter out already-indexed ones
    const candidates = jsonlFiles
      .map(e => {
        const sessionId = e.name.replace('.jsonl', '');
        return { name: e.name, sessionId };
      })
      .filter(c => !indexedIds.has(c.sessionId));

    if (candidates.length === 0) return [];

    // Get file stats and sort by mtime (newest first), limit to 50 for performance
    const withStats = await Promise.all(
      candidates.map(async c => {
        try {
          const stat = await fs.promises.stat(path.join(sessionsDir, c.name));
          return { ...c, mtime: stat.mtimeMs };
        } catch (error) {
          this.logger.debug(`Failed to stat file ${c.name}`, error);
          return null;
        }
      })
    );

    const validFiles = withStats
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50);

    this.logger.debug(
      `Scanning ${validFiles.length} .jsonl files not in sessions-index for ${projectPath}`
    );

    // Parse each file's metadata (in parallel, bounded)
    const entries = await Promise.all(
      validFiles.map(f => this.extractEntryFromJsonl(sessionsDir, f.name, f.mtime, projectPath))
    );

    return entries.filter((e): e is ClaudeSessionEntry => e !== null);
  }

  /**
   * Single-pass parse of all JSONL lines, returning every metadata field
   * the reader cares about. Used by both `extractEntryFromJsonl` (for files
   * not in the index) and `populateCustomTitle` (for index entries that
   * need a customTitle/messageCount lookup).
   *
   * One pass over `allLines` — no head/tail window, so `/rename` events
   * landing mid-session are never missed.
   */
  private parseJsonlMeta(allLines: string[]): {
    sessionId?: string;
    gitBranch: string;
    firstTimestamp?: string;
    firstPrompt: string;
    isSidechain: boolean;
    customTitle: string;
    messageCount: number;
  } {
    let sessionId: string | undefined;
    let gitBranch = '';
    let firstTimestamp: string | undefined;
    let firstPrompt = '';
    let isSidechain = false;
    let customTitle = '';
    let messageCount = 0;

    for (const line of allLines) {
      let data: JsonlLineData;
      try {
        data = JSON.parse(line);
      } catch {
        this.logger.debug(`Skipping unparseable JSONL line: ${line.slice(0, 100)}`);
        continue;
      }

      if (data.sessionId && !sessionId) {
        sessionId = data.sessionId;
      }
      if (data.gitBranch && !gitBranch) {
        gitBranch = data.gitBranch;
      }
      if (data.isSidechain) {
        isSidechain = true;
      }
      if (data.timestamp && !firstTimestamp) {
        firstTimestamp = data.timestamp;
      }

      // Track last custom-title entry — /rename can fire multiple times
      if (data.type === 'custom-title' && typeof data.customTitle === 'string') {
        customTitle = data.customTitle;
      }

      // Extract first user prompt
      if (data.type === 'user' && data.message?.role === 'user' && !firstPrompt) {
        const content = data.message.content;
        if (typeof content === 'string') {
          firstPrompt = content.slice(0, 200);
        } else if (Array.isArray(content)) {
          const textPart = content.find(p => p.type === 'text' && p.text);
          if (textPart?.text) {
            firstPrompt = textPart.text.slice(0, 200);
          }
        }
      }

      // Count user/assistant messages
      if ((data.type === 'user' && data.message?.role === 'user') || data.type === 'assistant') {
        messageCount++;
      }
    }

    return {
      sessionId,
      gitBranch,
      firstTimestamp,
      firstPrompt,
      isSidechain,
      customTitle,
      messageCount,
    };
  }

  /**
   * Extract a ClaudeSessionEntry from a .jsonl file via a single full-pass scan.
   * Returns null if the file can't be parsed.
   */
  private async extractEntryFromJsonl(
    sessionsDir: string,
    filename: string,
    mtimeMs: number,
    projectPath: string
  ): Promise<ClaudeSessionEntry | null> {
    const filePath = path.join(sessionsDir, filename);
    const sessionId = filename.replace('.jsonl', '');

    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const allLines = content.split(/\r?\n/).filter(l => l.trim());
      const meta = this.parseJsonlMeta(allLines);

      // Must have at least a session ID (from filename or content)
      const finalSessionId = meta.sessionId ?? sessionId;
      const created = meta.firstTimestamp ?? new Date(mtimeMs).toISOString();

      return {
        sessionId: finalSessionId,
        fullPath: filePath,
        fileMtime: mtimeMs,
        firstPrompt: meta.firstPrompt || 'No prompt',
        summary: '', // Summary requires full file analysis; leave empty for scanned entries
        messageCount: meta.messageCount,
        created,
        modified: new Date(mtimeMs).toISOString(), // Use file mtime as most accurate modified time
        gitBranch: meta.gitBranch,
        projectPath,
        isSidechain: meta.isSidechain,
        ...(meta.customTitle ? { customTitle: meta.customTitle } : {}),
      };
    } catch (error) {
      const msg = extractErrorMessage(error);
      this.logger.debug(`Failed to extract entry from ${filename}: ${msg}`);
      return null;
    }
  }

  /**
   * Populate customTitle for a sessions-index.json entry by scanning its JSONL.
   * Results are cached by sessionId+fileMtime to avoid repeated disk reads.
   */
  private async populateCustomTitle(
    entry: ClaudeSessionEntry,
    sessionsDir: string
  ): Promise<ClaudeSessionEntry> {
    const cacheKey = `${entry.sessionId}:${entry.fileMtime}`;
    if (this.customTitleCache.has(cacheKey)) {
      const cached = this.customTitleCache.get(cacheKey)!;
      return cached ? { ...entry, customTitle: cached } : entry;
    }

    const filePath = path.join(sessionsDir, `${entry.sessionId}.jsonl`);
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const allLines = content.split(/\r?\n/).filter(l => l.trim());
      const { customTitle } = this.parseJsonlMeta(allLines);

      // Evict any prior cache entries for this session at older mtimes
      // so the map can't grow without bound on repeated writes.
      const sessionPrefix = `${entry.sessionId}:`;
      for (const k of this.customTitleCache.keys()) {
        if (k.startsWith(sessionPrefix) && k !== cacheKey) {
          this.customTitleCache.delete(k);
        }
      }
      this.customTitleCache.set(cacheKey, customTitle);
      return customTitle ? { ...entry, customTitle } : entry;
    } catch {
      const sessionPrefix = `${entry.sessionId}:`;
      for (const k of this.customTitleCache.keys()) {
        if (k.startsWith(sessionPrefix) && k !== cacheKey) {
          this.customTitleCache.delete(k);
        }
      }
      this.customTitleCache.set(cacheKey, '');
      return entry;
    }
  }

  /**
   * Read a file with retry logic for Windows file locking.
   * Retries once after 500ms on EBUSY/EPERM errors.
   * Returns null if file does not exist.
   */
  private async readFileWithRetry(filePath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      const code = (error as NodeJS.ErrnoException).code;

      // File not found is expected -- not an error
      if (code === 'ENOENT') {
        this.logger.debug(`Sessions index not found: ${filePath}`);
        return null;
      }

      // Windows file locking: retry once after a short delay
      if (code === 'EBUSY' || code === 'EPERM') {
        this.logger.debug(`File locked (${code}), retrying in 500ms: ${filePath}`);
        await this.delay(500);

        try {
          return await fs.promises.readFile(filePath, 'utf-8');
        } catch (retryError: unknown) {
          const retryCode = (retryError as NodeJS.ErrnoException).code;
          if (retryCode === 'ENOENT') {
            return null;
          }
          throw retryError;
        }
      }

      throw error;
    }
  }

  /**
   * Parse the sessions index JSON content.
   * Returns null on parse errors.
   */
  private parseSessionsIndex(content: string, filePath: string): ClaudeSessionsIndex | null {
    try {
      const parsed = JSON.parse(content) as ClaudeSessionsIndex;

      // Basic validation
      if (!parsed || !Array.isArray(parsed.entries)) {
        this.logger.warn(`Invalid sessions index format at ${filePath}: missing entries array`);
        return null;
      }

      return parsed;
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      this.logger.warn(`Failed to parse sessions index at ${filePath}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Filter out sidechain sessions and sort by modified date descending (newest first).
   */
  private filterAndSort(entries: ClaudeSessionEntry[]): ClaudeSessionEntry[] {
    return entries
      .filter(entry => !entry.isSidechain)
      .sort((a, b) => {
        // Sort by modified date descending (newest first)
        const dateA = new Date(a.modified).getTime();
        const dateB = new Date(b.modified).getTime();
        return dateB - dateA;
      });
  }

  /**
   * Promise-based delay utility.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
