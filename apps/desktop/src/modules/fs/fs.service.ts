import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@omniscribe/shared';
import type {
  FsEntry,
  FsEntryKind,
  FsReadFileResponse,
  FsSearchMatch,
  FsGrepMatch,
} from '@omniscribe/shared';
import { resolveWithinRoot, resolveMutableWithinRoot } from './fs-paths';
import {
  SKIP_DIRS,
  MAX_READ_FILE_BYTES,
  BINARY_SNIFF_BYTES,
  SEARCH_WALK_LIMIT,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  GREP_DEFAULT_LIMIT,
  GREP_MAX_LIMIT,
  FS_CLI_TIMEOUT_MS,
} from './fs.constants';

const execFileAsync = promisify(execFile);

export interface FsReadDirResult {
  path: string;
  entries: FsEntry[];
}

export interface FsSearchResult {
  matches: FsSearchMatch[];
  truncated: boolean;
}

export interface FsGrepResult {
  matches: FsGrepMatch[];
  truncated: boolean;
}

export interface FsGrepOptions {
  fixedString?: boolean;
  caseInsensitive?: boolean;
  limit?: number;
}

/**
 * Filesystem domain service for the file explorer / editor.
 *
 * Every public method takes the authorized `projectPath` (the security
 * boundary) plus a target. Targets are canonicalized and asserted to stay
 * inside the root via {@link resolveWithinRoot} / {@link resolveMutableWithinRoot}
 * before any I/O happens — there is no code path that touches a path which
 * escaped the boundary.
 */
@Injectable()
export class FsService {
  private readonly logger = createLogger('FsService');

  /** Cached ripgrep availability (checked once per process). */
  private ripgrepAvailable: boolean | undefined;

  // ---------------------------------------------------------------------------
  // Read operations
  // ---------------------------------------------------------------------------

  /** List the entries of a directory, sorted dirs-first then by name. */
  async readDir(projectPath: string, target?: string): Promise<FsReadDirResult> {
    const dir = resolveWithinRoot(projectPath, target);
    const dirents = await fsp.readdir(dir, { withFileTypes: true });

    const entries = await Promise.all(
      dirents.map(async dirent => {
        const fullPath = path.join(dir, dirent.name);
        return this.statEntry(fullPath, dirent.name, dirent);
      })
    );

    entries.sort(compareEntries);
    return { path: dir, entries };
  }

  /** Stat a single path within the project root. */
  async stat(projectPath: string, target: string): Promise<FsEntry> {
    const resolved = resolveWithinRoot(projectPath, target);
    return this.statEntry(resolved, path.basename(resolved));
  }

  /**
   * Read a file's content. Caps at {@link MAX_READ_FILE_BYTES}; binary files
   * (detected by a NUL byte in the first {@link BINARY_SNIFF_BYTES}) return a
   * `{ binary: true }` marker instead of content. UTF-8 only for v1.
   */
  async readFile(projectPath: string, target: string): Promise<FsReadFileResponse> {
    const resolved = resolveWithinRoot(projectPath, target);
    const stats = await fsp.stat(resolved);

    if (!stats.isFile()) {
      throw new Error('Target is not a regular file');
    }

    if (stats.size > MAX_READ_FILE_BYTES) {
      return { path: resolved, tooLarge: true, size: stats.size };
    }

    const buffer = await fsp.readFile(resolved);

    if (isBinaryBuffer(buffer)) {
      return { path: resolved, binary: true, size: stats.size };
    }

    return { path: resolved, content: buffer.toString('utf8'), size: stats.size };
  }

  // ---------------------------------------------------------------------------
  // Mutation operations
  // ---------------------------------------------------------------------------

  /** Atomically write UTF-8 content to a file (temp file + rename). */
  async writeFile(projectPath: string, target: string, content: string): Promise<string> {
    const resolved = resolveMutableWithinRoot(projectPath, target);
    const dir = path.dirname(resolved);
    await fsp.mkdir(dir, { recursive: true });

    // Write to a sibling temp file then rename — rename is atomic on the same
    // filesystem, so readers never observe a partially written file.
    const tmp = path.join(dir, `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
    try {
      await fsp.writeFile(tmp, content, 'utf8');
      await fsp.rename(tmp, resolved);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
    return resolved;
  }

  /** Create a new empty file. Fails if it already exists. */
  async createFile(projectPath: string, target: string): Promise<string> {
    const resolved = resolveMutableWithinRoot(projectPath, target);
    await fsp.mkdir(path.dirname(resolved), { recursive: true });
    // 'wx' → fail if the path exists.
    const handle = await fsp.open(resolved, 'wx');
    await handle.close();
    return resolved;
  }

  /** Create a new directory (recursive). */
  async createDir(projectPath: string, target: string): Promise<string> {
    const resolved = resolveMutableWithinRoot(projectPath, target);
    await fsp.mkdir(resolved, { recursive: true });
    return resolved;
  }

  /** Rename / move a path. Both source and destination must stay in-root. */
  async rename(projectPath: string, from: string, to: string): Promise<string> {
    const resolvedFrom = resolveMutableWithinRoot(projectPath, from);
    const resolvedTo = resolveMutableWithinRoot(projectPath, to);
    await fsp.mkdir(path.dirname(resolvedTo), { recursive: true });
    await fsp.rename(resolvedFrom, resolvedTo);
    return resolvedTo;
  }

  /**
   * Delete a path by sending it to the OS recycle bin via electron's
   * `shell.trashItem` — never a hard `rm -rf`, so the user can recover.
   * Electron is required lazily so the service stays unit-testable.
   */
  async delete(projectPath: string, target: string): Promise<string> {
    const resolved = resolveMutableWithinRoot(projectPath, target);
    // Confirm the target exists before trashing (clearer error than electron's).
    await fsp.lstat(resolved);

    const { shell } = require('electron') as typeof import('electron');
    await shell.trashItem(resolved);
    return resolved;
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  /**
   * Fuzzy file-name search over a bounded walk. Respects .gitignore via
   * `git ls-files` when the project is a git repo; otherwise walks manually
   * with the {@link SKIP_DIRS} blocklist.
   */
  async search(projectPath: string, query: string, limit?: number): Promise<FsSearchResult> {
    const root = resolveWithinRoot(projectPath);
    const cap = clampLimit(limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT);

    const { files, truncated } = await this.listProjectFiles(root);

    const trimmed = query.trim();
    const scored: FsSearchMatch[] = [];
    for (const relativePath of files) {
      const score =
        trimmed.length === 0 ? 0 : fuzzyScore(trimmed.toLowerCase(), relativePath.toLowerCase());
      if (trimmed.length === 0 || score > 0) {
        scored.push({ path: path.join(root, relativePath), relativePath, score });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));
    return { matches: scored.slice(0, cap), truncated };
  }

  /**
   * Content grep. Prefers `rg --json` when ripgrep is installed, falls back to
   * `git grep -n`, then to a bounded JS scan. Results are capped.
   */
  async grep(
    projectPath: string,
    query: string,
    options: FsGrepOptions = {}
  ): Promise<FsGrepResult> {
    const root = resolveWithinRoot(projectPath);
    const cap = clampLimit(options.limit, GREP_DEFAULT_LIMIT, GREP_MAX_LIMIT);

    if (query.trim().length === 0) {
      return { matches: [], truncated: false };
    }

    if (await this.hasRipgrep()) {
      try {
        return await this.grepWithRipgrep(root, query, options, cap);
      } catch (err) {
        this.logger.warn('ripgrep grep failed, falling back', err);
      }
    }

    if (await this.isGitRepo(root)) {
      try {
        return await this.grepWithGit(root, query, options, cap);
      } catch (err) {
        this.logger.warn('git grep failed, falling back to JS scan', err);
      }
    }

    return this.grepWithJsScan(root, query, options, cap);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async statEntry(fullPath: string, name: string, dirent?: fs.Dirent): Promise<FsEntry> {
    // lstat so symlinks are reported as symlinks (and never followed for size).
    const stats = await fsp.lstat(fullPath);
    let kind: FsEntryKind;
    if (dirent?.isSymbolicLink() || stats.isSymbolicLink()) {
      kind = 'symlink';
    } else if (stats.isDirectory()) {
      kind = 'dir';
    } else {
      kind = 'file';
    }
    return {
      name,
      path: fullPath,
      kind,
      size: stats.isDirectory() ? 0 : stats.size,
      mtime: stats.mtimeMs,
    };
  }

  /**
   * Build the list of project-relative file paths for search. Uses
   * `git ls-files --cached --others --exclude-standard` when possible so the
   * user's .gitignore is honoured; otherwise a manual SKIP_DIRS walk.
   */
  private async listProjectFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
    if (await this.isGitRepo(root)) {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
          { cwd: root, timeout: FS_CLI_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }
        );
        const files = stdout.split('\0').filter(Boolean);
        if (files.length > SEARCH_WALK_LIMIT) {
          return { files: files.slice(0, SEARCH_WALK_LIMIT), truncated: true };
        }
        return { files, truncated: false };
      } catch (err) {
        this.logger.warn('git ls-files failed, falling back to manual walk', err);
      }
    }
    return this.walkFiles(root);
  }

  /** Manual recursive file walk honouring SKIP_DIRS, bounded by SEARCH_WALK_LIMIT. */
  private async walkFiles(root: string): Promise<{ files: string[]; truncated: boolean }> {
    const files: string[] = [];
    let truncated = false;
    const stack: string[] = [root];

    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let dirents: fs.Dirent[];
      try {
        dirents = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const dirent of dirents) {
        if (dirent.isSymbolicLink()) continue; // don't follow symlinks while walking
        const full = path.join(dir, dirent.name);
        if (dirent.isDirectory()) {
          if (SKIP_DIRS.has(dirent.name)) continue;
          stack.push(full);
        } else if (dirent.isFile()) {
          files.push(path.relative(root, full));
          if (files.length >= SEARCH_WALK_LIMIT) {
            truncated = true;
            return { files, truncated };
          }
        }
      }
    }
    return { files, truncated };
  }

  private async grepWithRipgrep(
    root: string,
    query: string,
    options: FsGrepOptions,
    cap: number
  ): Promise<FsGrepResult> {
    const args = ['--json', '-m', String(cap)];
    if (options.fixedString) args.push('-F');
    if (options.caseInsensitive) args.push('-i');
    // Terminate option parsing so a query starting with `-` is treated literally.
    args.push('-e', query, '.');

    const { stdout } = await execFileAsync('rg', args, {
      cwd: root,
      timeout: FS_CLI_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    }).catch((err: NodeJS.ErrnoException & { stdout?: string; code?: number }) => {
      // rg exits 1 when there are no matches — that's not an error for us.
      if (err.code === 1 && typeof err.stdout === 'string') {
        return { stdout: err.stdout };
      }
      throw err;
    });

    const matches: FsGrepMatch[] = [];
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      let parsed: RipgrepEvent;
      try {
        parsed = JSON.parse(line) as RipgrepEvent;
      } catch {
        continue;
      }
      if (parsed.type !== 'match' || !parsed.data) continue;
      const rel = parsed.data.path?.text;
      if (!rel) continue;
      const text = parsed.data.lines?.text ?? '';
      const firstSubmatch = parsed.data.submatches?.[0];
      matches.push({
        path: path.join(root, rel),
        relativePath: rel,
        line: parsed.data.line_number ?? 0,
        column: (firstSubmatch?.start ?? 0) + 1,
        text: text.replace(/\r?\n$/, ''),
      });
      if (matches.length >= cap) break;
    }
    return { matches, truncated: matches.length >= cap };
  }

  private async grepWithGit(
    root: string,
    query: string,
    options: FsGrepOptions,
    cap: number
  ): Promise<FsGrepResult> {
    const args = ['grep', '-n', '--no-color', '-I'];
    if (options.fixedString) args.push('-F');
    if (options.caseInsensitive) args.push('-i');
    args.push('-e', query);

    const { stdout } = await execFileAsync('git', args, {
      cwd: root,
      timeout: FS_CLI_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
    }).catch((err: NodeJS.ErrnoException & { stdout?: string; code?: number }) => {
      // git grep exits 1 when there are no matches.
      if (err.code === 1 && typeof err.stdout === 'string') {
        return { stdout: err.stdout };
      }
      throw err;
    });

    const matches: FsGrepMatch[] = [];
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      // Format: <path>:<line>:<text>
      const firstColon = line.indexOf(':');
      const secondColon = line.indexOf(':', firstColon + 1);
      if (firstColon < 0 || secondColon < 0) continue;
      const rel = line.slice(0, firstColon);
      const lineNo = Number.parseInt(line.slice(firstColon + 1, secondColon), 10);
      const text = line.slice(secondColon + 1);
      if (!Number.isFinite(lineNo)) continue;
      matches.push({
        path: path.join(root, rel),
        relativePath: rel,
        line: lineNo,
        column: 1,
        text,
      });
      if (matches.length >= cap) break;
    }
    return { matches, truncated: matches.length >= cap };
  }

  private async grepWithJsScan(
    root: string,
    query: string,
    options: FsGrepOptions,
    cap: number
  ): Promise<FsGrepResult> {
    const matcher = buildJsMatcher(query, options);
    const { files } = await this.walkFiles(root);
    const matches: FsGrepMatch[] = [];

    for (const rel of files) {
      if (matches.length >= cap) break;
      const full = path.join(root, rel);
      let buffer: Buffer;
      try {
        const stats = await fsp.stat(full);
        if (stats.size > MAX_READ_FILE_BYTES) continue;
        buffer = await fsp.readFile(full);
      } catch {
        continue;
      }
      if (isBinaryBuffer(buffer)) continue;
      const lines = buffer.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const column = matcher(lines[i]);
        if (column >= 0) {
          matches.push({
            path: full,
            relativePath: rel,
            line: i + 1,
            column: column + 1,
            text: lines[i].replace(/\r$/, ''),
          });
          if (matches.length >= cap) break;
        }
      }
    }
    return { matches, truncated: matches.length >= cap };
  }

  private async hasRipgrep(): Promise<boolean> {
    if (this.ripgrepAvailable !== undefined) return this.ripgrepAvailable;
    try {
      await execFileAsync('rg', ['--version'], { timeout: FS_CLI_TIMEOUT_MS });
      this.ripgrepAvailable = true;
    } catch {
      this.ripgrepAvailable = false;
    }
    return this.ripgrepAvailable;
  }

  private async isGitRepo(root: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: root,
        timeout: FS_CLI_TIMEOUT_MS,
      });
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }
}

// =============================================================================
// Pure helpers
// =============================================================================

interface RipgrepEvent {
  type: string;
  data?: {
    path?: { text?: string };
    lines?: { text?: string };
    line_number?: number;
    submatches?: Array<{ start: number; end: number }>;
  };
}

/** Sort: directories first, then case-insensitive name. */
function compareEntries(a: FsEntry, b: FsEntry): number {
  const aDir = a.kind === 'dir' ? 0 : 1;
  const bDir = b.kind === 'dir' ? 0 : 1;
  if (aDir !== bDir) return aDir - bDir;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/** NUL-byte sniff over the first BINARY_SNIFF_BYTES of a buffer. */
function isBinaryBuffer(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(Math.floor(limit), max);
}

/**
 * Subsequence fuzzy score: every char of `query` must appear in order in
 * `text`. Rewards contiguous runs and matches right after a path separator
 * (so "barbaz" scores `foo/barbaz.ts` highly). Returns 0 for no match.
 */
function fuzzyScore(query: string, text: string): number {
  let score = 0;
  let ti = 0;
  let consecutive = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const qc = query[qi];
    let found = false;
    while (ti < text.length) {
      const tc = text[ti];
      ti++;
      if (tc === qc) {
        score += 1;
        if (consecutive > 0) score += consecutive; // reward contiguous runs
        const prev = text[ti - 2];
        if (prev === '/' || prev === '\\' || prev === '.' || prev === undefined) score += 2;
        consecutive++;
        found = true;
        break;
      }
      consecutive = 0;
    }
    if (!found) return 0;
  }
  return score;
}

/** Build a per-line matcher returning the 0-based column of the first hit, or -1. */
function buildJsMatcher(query: string, options: FsGrepOptions): (line: string) => number {
  if (options.fixedString) {
    if (options.caseInsensitive) {
      const needle = query.toLowerCase();
      return line => line.toLowerCase().indexOf(needle);
    }
    return line => line.indexOf(query);
  }
  let regex: RegExp;
  try {
    regex = new RegExp(query, options.caseInsensitive ? 'i' : '');
  } catch {
    // Invalid regex → treat as a literal substring.
    const needle = options.caseInsensitive ? query.toLowerCase() : query;
    return line => (options.caseInsensitive ? line.toLowerCase() : line).indexOf(needle);
  }
  return line => {
    const m = regex.exec(line);
    return m ? m.index : -1;
  };
}
