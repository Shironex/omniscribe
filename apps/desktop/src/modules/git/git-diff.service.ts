import { Injectable } from '@nestjs/common';
import { platform } from 'os';
import { createLogger } from '@omniscribe/shared';
import type { GitFileDiff, GitDiffHunk, GitDiffLine } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';
import { GitStatusService } from './git-status.service';

const NULL_DEVICE = platform() === 'win32' ? 'NUL' : '/dev/null';

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.ico',
  '.webp',
  '.svg',
  '.mp3',
  '.mp4',
  '.wav',
  '.ogg',
  '.webm',
  '.mov',
  '.avi',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.o',
  '.obj',
  '.pyc',
  '.class',
  '.jar',
  '.war',
  '.node',
  '.wasm',
]);

@Injectable()
export class GitDiffService {
  private readonly logger = createLogger('GitDiffService');

  constructor(
    private readonly gitBase: GitBaseService,
    private readonly gitStatus: GitStatusService
  ) {}

  /**
   * Get structured diff for the working directory.
   * Shows all changes (staged + unstaged) relative to baseCommit or HEAD.
   */
  async getDiff(
    projectPath: string,
    baseCommit?: string,
    includeUntracked = true
  ): Promise<{ files: GitFileDiff[]; totalAdditions: number; totalDeletions: number }> {
    const ref = baseCommit ?? 'HEAD';
    this.logger.debug(`Getting diff against ${ref} in ${projectPath}`);

    // Get diff for tracked changes (staged + unstaged vs ref)
    const rawDiff = await this.getRawDiff(projectPath, ref);

    const files = this.parseUnifiedDiff(rawDiff);

    // Add synthetic diffs for untracked files (parallelized)
    if (includeUntracked) {
      const untrackedFiles = await this.getUntrackedFiles(projectPath);
      const results = await Promise.all(
        untrackedFiles.map(filePath => this.generateSyntheticDiff(projectPath, filePath))
      );
      for (const syntheticDiff of results) {
        if (syntheticDiff) {
          files.push(syntheticDiff);
        }
      }
    }

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const file of files) {
      totalAdditions += file.additions;
      totalDeletions += file.deletions;
    }

    return { files, totalAdditions, totalDeletions };
  }

  private async getRawDiff(projectPath: string, ref: string): Promise<string> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'diff',
        ref,
        '--no-color',
        '--unified=3',
      ]);
      return stdout;
    } catch {
      // If ref doesn't exist (e.g. no commits yet), fall back to diffing the index
      this.logger.debug(`Failed to diff against ${ref}, falling back to cached diff`);
      try {
        const { stdout } = await this.gitBase.execGit(projectPath, [
          'diff',
          '--cached',
          '--no-color',
          '--unified=3',
        ]);
        return stdout;
      } catch {
        return '';
      }
    }
  }

  /**
   * Parse unified diff output into structured GitFileDiff objects
   */
  parseUnifiedDiff(rawDiff: string): GitFileDiff[] {
    if (!rawDiff.trim()) return [];

    const files: GitFileDiff[] = [];
    // Split by file boundary (diff --git a/... b/...)
    const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean);

    for (const section of fileSections) {
      const lines = section.split('\n');
      if (lines.length === 0) continue;

      // Parse file paths from first line: "a/path b/path"
      // Handles quoted paths for files with spaces (e.g. "a/foo bar" -> quoted by git)
      const headerMatch = lines[0].match(/^a\/((?:"[^"]+"|.+?)) b\/((?:"[^"]+"|.+?))$/);
      if (!headerMatch) continue;

      const oldPath = headerMatch[1].startsWith('"') ? headerMatch[1].slice(1, -1) : headerMatch[1];
      const newPath = headerMatch[2].startsWith('"') ? headerMatch[2].slice(1, -1) : headerMatch[2];

      // Check for binary
      const isBinary = lines.some(
        l => l.startsWith('Binary files') || l.includes('GIT binary patch')
      );

      if (isBinary) {
        files.push({
          path: newPath,
          oldPath: oldPath !== newPath ? oldPath : undefined,
          isBinary: true,
          hunks: [],
          additions: 0,
          deletions: 0,
        });
        continue;
      }

      // Parse hunks
      const hunks: GitDiffHunk[] = [];
      let currentHunk: GitDiffHunk | null = null;
      let oldLineNum = 0;
      let newLineNum = 0;

      for (const line of lines) {
        const hunkHeaderMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
        if (hunkHeaderMatch) {
          if (currentHunk) hunks.push(currentHunk);
          oldLineNum = parseInt(hunkHeaderMatch[1], 10);
          newLineNum = parseInt(hunkHeaderMatch[3], 10);
          currentHunk = {
            oldStart: oldLineNum,
            oldLines: parseInt(hunkHeaderMatch[2] ?? '1', 10),
            newStart: newLineNum,
            newLines: parseInt(hunkHeaderMatch[4] ?? '1', 10),
            header: hunkHeaderMatch[5].trim(),
            lines: [],
          };
          continue;
        }

        if (!currentHunk) continue;

        if (line.startsWith('+')) {
          const diffLine: GitDiffLine = {
            type: 'addition',
            content: line.slice(1),
            newLineNumber: newLineNum++,
          };
          currentHunk.lines.push(diffLine);
        } else if (line.startsWith('-')) {
          const diffLine: GitDiffLine = {
            type: 'deletion',
            content: line.slice(1),
            oldLineNumber: oldLineNum++,
          };
          currentHunk.lines.push(diffLine);
        } else if (line.startsWith(' ')) {
          const diffLine: GitDiffLine = {
            type: 'context',
            content: line.slice(1),
            oldLineNumber: oldLineNum++,
            newLineNumber: newLineNum++,
          };
          currentHunk.lines.push(diffLine);
        }
        // Skip other lines (e.g. "\ No newline at end of file")
      }
      if (currentHunk) hunks.push(currentHunk);

      let additions = 0;
      let deletions = 0;
      for (const hunk of hunks) {
        for (const l of hunk.lines) {
          if (l.type === 'addition') additions++;
          else if (l.type === 'deletion') deletions++;
        }
      }

      files.push({
        path: newPath,
        oldPath: oldPath !== newPath ? oldPath : undefined,
        isBinary: false,
        hunks,
        additions,
        deletions,
      });
    }

    return files;
  }

  private async getUntrackedFiles(projectPath: string): Promise<string[]> {
    try {
      const status = await this.gitStatus.getStatus(projectPath);
      return status.untracked;
    } catch {
      return [];
    }
  }

  private async generateSyntheticDiff(
    projectPath: string,
    filePath: string
  ): Promise<GitFileDiff | null> {
    const dotIndex = filePath.lastIndexOf('.');
    const ext = dotIndex !== -1 ? filePath.substring(dotIndex) : '';
    if (ext && BINARY_EXTENSIONS.has(ext.toLowerCase())) {
      return {
        path: filePath,
        isBinary: true,
        hunks: [],
        additions: 0,
        deletions: 0,
      };
    }

    try {
      // Generate a diff against /dev/null to create a synthetic "new file" diff
      const { stdout: diffOutput } = await this.gitBase.execGit(projectPath, [
        'diff',
        '--no-index',
        '--no-color',
        '--unified=3',
        '--',
        NULL_DEVICE,
        filePath,
      ]);

      const parsed = this.parseUnifiedDiff(diffOutput);
      if (parsed.length > 0) {
        // Fix the path — git diff --no-index uses the full filesystem path
        return {
          ...parsed[0],
          path: filePath,
          oldPath: undefined,
        };
      }
    } catch {
      this.logger.debug(`Failed to generate synthetic diff for ${filePath}`);
    }

    return null;
  }
}
