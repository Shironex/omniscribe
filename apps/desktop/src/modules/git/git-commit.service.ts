import { Injectable } from '@nestjs/common';
import { CommitInfo } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';

@Injectable()
export class GitCommitService {
  constructor(private readonly gitBase: GitBaseService) {}

  /**
   * Get commit log
   */
  async getCommitLog(
    repoPath: string,
    limit: number = 50,
    allBranches: boolean = true,
  ): Promise<CommitInfo[]> {
    const commits: CommitInfo[] = [];

    // Format: hash|shortHash|subject|body|authorName|authorEmail|authorDate|committerName|committerEmail|commitDate|parents|refs
    // Note: Double quotes around format string for Windows compatibility (prevents % variable expansion)
    const format = [
      '%H',      // hash
      '%h',      // shortHash
      '%s',      // subject
      '%b',      // body
      '%an',     // authorName
      '%ae',     // authorEmail
      '%aI',     // authorDate (ISO 8601)
      '%cn',     // committerName
      '%ce',     // committerEmail
      '%cI',     // commitDate (ISO 8601)
      '%P',      // parents (space-separated)
      '%D',      // refs
    ].join('%x00'); // Use null byte as separator

    const args = [
      'log',
      `--format="${format}"`,
      `-n${limit}`,
      '--date=iso-strict',
    ];

    if (allBranches) {
      args.push('--all');
    }

    const { stdout } = await this.gitBase.execGit(repoPath, args);

    for (const entry of stdout.trim().split('\n')) {
      if (!entry) continue;

      // Remove surrounding quotes that may be present on Windows
      const cleanEntry = entry.replace(/^["']|["']$/g, '');
      if (!cleanEntry) continue;

      const parts = cleanEntry.split('\x00');
      if (parts.length < 12) continue;

      // First and last elements may have quotes on Windows
      const hash = parts[0].replace(/^["']/, '');
      const shortHash = parts[1];
      const subject = parts[2];
      const body = parts[3];
      const authorName = parts[4];
      const authorEmail = parts[5];
      const authorDate = parts[6];
      const committerName = parts[7];
      const committerEmail = parts[8];
      const commitDate = parts[9];
      const parents = parts[10];
      const refs = parts[11].replace(/["']$/, ''); // Remove trailing quote if present

      commits.push({
        hash,
        shortHash,
        subject,
        body: body || undefined,
        authorName,
        authorEmail,
        authorDate: new Date(authorDate),
        committerName,
        committerEmail,
        commitDate: new Date(commitDate),
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        refs: refs ? refs.split(', ').filter(Boolean) : undefined,
      });
    }

    return commits;
  }

  /**
   * Stage files for commit
   */
  async stage(projectPath: string, files: string[]): Promise<void> {
    if (files.length === 0) return;

    await this.gitBase.execGit(projectPath, ['add', '--', ...files]);
  }

  /**
   * Unstage files from the index
   */
  async unstage(projectPath: string, files: string[]): Promise<void> {
    if (files.length === 0) return;

    await this.gitBase.execGit(projectPath, ['restore', '--staged', '--', ...files]);
  }

  /**
   * Create a commit with the given message
   * @returns The commit hash of the new commit
   */
  async commit(projectPath: string, message: string): Promise<string> {
    await this.gitBase.execGit(projectPath, ['commit', '-m', message]);

    // Get the hash of the newly created commit
    const { stdout } = await this.gitBase.execGit(projectPath, ['rev-parse', 'HEAD']);
    return stdout.trim();
  }

  /**
   * Get diff for the working tree or a specific file
   * @param projectPath - Repository path
   * @param file - Optional specific file to diff
   * @returns The diff output as a string
   */
  async diff(projectPath: string, file?: string): Promise<string> {
    const args = ['diff'];
    if (file) {
      args.push('--', file);
    }
    const { stdout } = await this.gitBase.execGit(projectPath, args);
    return stdout;
  }
}
