import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  ClaudeSessionEntry,
  ClaudeSessionsIndex,
  createLogger,
  getClaudeSessionsDir,
  getSessionsIndexPath,
} from '@omniscribe/shared';

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
@Injectable()
export class ClaudeSessionReaderService implements OnModuleDestroy {
  private readonly logger = createLogger('ClaudeSessionReaderService');

  /** Active file watchers keyed by project path, for cleanup on destroy */
  private watchers = new Map<string, fs.FSWatcher>();

  onModuleDestroy(): void {
    // Close all active file watchers
    for (const [projectPath, watcher] of this.watchers.entries()) {
      this.logger.debug(`Closing watcher for ${projectPath}`);
      watcher.close();
    }
    this.watchers.clear();
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to read sessions index: ${errorMessage}`);
    }

    // Step 2: Scan for .jsonl files not already in the index
    const indexedIds = new Set(indexEntries.map(e => e.sessionId));
    let scannedEntries: ClaudeSessionEntry[] = [];

    try {
      scannedEntries = await this.scanJsonlFiles(sessionsDir, indexedIds, projectPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to scan .jsonl files: ${errorMessage}`);
    }

    // Step 3: Merge and return
    const allEntries = [...indexEntries, ...scannedEntries];
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
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`Watcher callback error for ${projectPath}: ${errorMessage}`);
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
        this.logger.error(`File watcher error for ${projectPath}: ${error.message}`);
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to set up watcher for ${projectPath}: ${errorMessage}`);
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
        } catch {
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
   * Extract a ClaudeSessionEntry from a .jsonl file by reading the first few lines.
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
      const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

      let lineCount = 0;
      let extractedSessionId: string | undefined;
      let gitBranch = '';
      let firstTimestamp: string | undefined;
      let firstPrompt = '';
      let isSidechain = false;

      for await (const line of rl) {
        if (lineCount >= 20) break; // Only read first 20 lines
        lineCount++;

        if (!line.trim()) continue;

        try {
          const data: JsonlLineData = JSON.parse(line);

          // Extract session metadata from any line that has it
          if (data.sessionId && !extractedSessionId) {
            extractedSessionId = data.sessionId;
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
        } catch {
          // Skip unparseable lines
        }
      }

      rl.close();
      fileStream.destroy();

      // Must have at least a session ID (from filename or content)
      const finalSessionId = extractedSessionId ?? sessionId;

      const created = firstTimestamp ?? new Date(mtimeMs).toISOString();

      return {
        sessionId: finalSessionId,
        fullPath: filePath,
        fileMtime: mtimeMs,
        firstPrompt: firstPrompt || 'No prompt',
        summary: '', // Summary requires full file analysis; leave empty for scanned entries
        messageCount: 0, // Unknown without full scan
        created,
        modified: new Date(mtimeMs).toISOString(), // Use file mtime as most accurate modified time
        gitBranch,
        projectPath,
        isSidechain,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to extract entry from ${filename}: ${msg}`);
      return null;
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
      const errorMessage = error instanceof Error ? error.message : String(error);
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
