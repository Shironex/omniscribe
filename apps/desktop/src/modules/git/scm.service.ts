import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { isAbsolute, normalize, resolve, sep } from 'path';
import type {
  GitFileStatus,
  ScmChangedEvent,
  ScmCommitFile,
  ScmDiffResponse,
  ScmErrorCode,
  ScmFileEntry,
  ScmLogEntry,
  ScmPanelSnapshotResponse,
  ScmShowCommitResponse,
} from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';
import { GitRepoService } from './git-repo.service';
import { GitDiffService } from './git-diff.service';

/**
 * Typed error carrying a machine-readable {@link ScmErrorCode}. The gateway
 * unwraps this into `{ error, errorCode }` so the UI can branch on the code.
 */
export class ScmError extends Error {
  constructor(
    public readonly code: ScmErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ScmError';
  }
}

/** Null byte used as a field separator in machine-readable `git log` output. */
const NUL = '\x00';

/**
 * ScmService implements the source-control surface for the SCM panel: a single
 * batched panel snapshot, file/hunk staging, commit, remote sync (fetch / pull
 * ff-only / push), and paginated history with per-commit + working-tree diffs.
 *
 * All git invocations go through GitBaseService (execFile, no shell) and all
 * caller-supplied pathspecs are validated to stay inside the repo root.
 */
@Injectable()
export class ScmService {
  constructor(
    private readonly gitBase: GitBaseService,
    private readonly gitRepo: GitRepoService,
    private readonly gitDiff: GitDiffService
  ) {}

  // ==================== Panel snapshot ====================

  /**
   * Batched SCM panel primitive: one `git status --porcelain=v2 --branch`
   * exec parsed into branch/upstream/ahead-behind + the four change buckets,
   * plus merge/rebase-in-progress flags. This is the panel's polling/refresh
   * call — kept to a minimal number of git spawns.
   */
  async panelSnapshot(projectPath: string): Promise<ScmPanelSnapshotResponse> {
    const isRepo = await this.gitRepo.isGitRepository(projectPath);
    if (!isRepo) {
      return {
        isRepo: false,
        ahead: 0,
        behind: 0,
        staged: [],
        unstaged: [],
        untracked: [],
        conflicted: [],
        isMerging: false,
        isRebasing: false,
      };
    }

    const rootPath = await this.gitRepo.getRepositoryRoot(projectPath);

    const { stdout } = await this.gitBase.execGit(projectPath, [
      'status',
      '--porcelain=v2',
      '--branch',
      '--untracked-files=all',
    ]);

    const parsed = this.parsePorcelainV2(stdout);

    const [isMerging, isRebasing] = await Promise.all([
      this.inProgress(projectPath, 'MERGE_HEAD'),
      this.rebaseInProgress(projectPath),
    ]);

    return {
      isRepo: true,
      rootPath,
      branch: parsed.branch,
      detachedHead: parsed.detachedHead,
      upstream: parsed.upstream,
      ahead: parsed.ahead,
      behind: parsed.behind,
      staged: parsed.staged,
      unstaged: parsed.unstaged,
      untracked: parsed.untracked,
      conflicted: parsed.conflicted,
      isMerging,
      isRebasing,
    };
  }

  /**
   * Parse `git status --porcelain=v2 --branch` output. Handles the branch
   * header lines, ordinary (1) + rename/copy (2) entries with their XY codes,
   * unmerged (u) conflicts, and untracked (?) entries. Exposed for unit tests.
   */
  parsePorcelainV2(stdout: string): {
    branch?: string;
    detachedHead?: string;
    upstream?: string;
    ahead: number;
    behind: number;
    staged: ScmFileEntry[];
    unstaged: ScmFileEntry[];
    untracked: ScmFileEntry[];
    conflicted: ScmFileEntry[];
  } {
    let branch: string | undefined;
    let detachedHead: string | undefined;
    let upstream: string | undefined;
    let ahead = 0;
    let behind = 0;
    const staged: ScmFileEntry[] = [];
    const unstaged: ScmFileEntry[] = [];
    const untracked: ScmFileEntry[] = [];
    const conflicted: ScmFileEntry[] = [];

    for (const line of stdout.split('\n')) {
      if (!line) continue;

      if (line.startsWith('# branch.oid ')) {
        // Header — `(initial)` on an unborn branch; the hash otherwise.
        continue;
      } else if (line.startsWith('# branch.head ')) {
        const head = line.slice('# branch.head '.length).trim();
        // `(detached)` indicates no current branch.
        branch = head === '(detached)' ? undefined : head;
      } else if (line.startsWith('# branch.upstream ')) {
        upstream = line.slice('# branch.upstream '.length).trim() || undefined;
      } else if (line.startsWith('# branch.ab ')) {
        const m = line.match(/\+(\d+)\s+-(\d+)/);
        if (m) {
          ahead = parseInt(m[1], 10);
          behind = parseInt(m[2], 10);
        }
      } else if (line.startsWith('1 ')) {
        // Ordinary changed entry:
        // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
        const parts = line.split(' ');
        const xy = parts[1];
        const path = parts.slice(8).join(' ');
        this.pushXy(xy, path, undefined, staged, unstaged);
      } else if (line.startsWith('2 ')) {
        // Rename/copy entry:
        // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path>\t<origPath>
        const parts = line.split(' ');
        const xy = parts[1];
        const pathPart = parts.slice(9).join(' ');
        const tab = pathPart.indexOf('\t');
        const path = tab === -1 ? pathPart : pathPart.slice(0, tab);
        const oldPath = tab === -1 ? undefined : pathPart.slice(tab + 1);
        this.pushXy(xy, path, oldPath, staged, unstaged);
      } else if (line.startsWith('u ')) {
        // Unmerged (conflict) entry:
        // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
        const parts = line.split(' ');
        const xy = parts[1];
        const path = parts.slice(10).join(' ');
        conflicted.push({ path, status: 'conflicted', xy });
      } else if (line.startsWith('? ')) {
        untracked.push({ path: line.slice(2), status: 'untracked', xy: '??' });
      }
      // '!' (ignored) entries are not requested (no --ignored), so skipped.
    }

    if (branch === undefined && !upstream) {
      // Detached HEAD: surface the short oid for the UI header.
      const oidLine = stdout.split('\n').find(l => l.startsWith('# branch.oid '));
      if (oidLine) {
        const oid = oidLine.slice('# branch.oid '.length).trim();
        if (oid && oid !== '(initial)') detachedHead = oid.slice(0, 7);
      }
    }

    return {
      branch,
      detachedHead,
      upstream,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      conflicted,
    };
  }

  /** Push a porcelain-v2 XY code into the staged/unstaged buckets. */
  private pushXy(
    xy: string,
    path: string,
    oldPath: string | undefined,
    staged: ScmFileEntry[],
    unstaged: ScmFileEntry[]
  ): void {
    const indexCode = xy[0];
    const worktreeCode = xy[1];
    if (indexCode && indexCode !== '.') {
      staged.push({ path, oldPath, status: this.statusFromCode(indexCode), xy });
    }
    if (worktreeCode && worktreeCode !== '.') {
      // Worktree side of a rename still reports the new path; oldPath only
      // meaningfully applies to the index (staged) side.
      unstaged.push({ path, status: this.statusFromCode(worktreeCode), xy });
    }
  }

  private statusFromCode(code: string): GitFileStatus {
    switch (code) {
      case 'M':
        return 'modified';
      case 'A':
        return 'added';
      case 'D':
        return 'deleted';
      case 'R':
        return 'renamed';
      case 'C':
        return 'copied';
      case 'U':
        return 'conflicted';
      default:
        return 'modified';
    }
  }

  // ==================== Staging ====================

  /** Stage paths: `git add -- <paths>`. */
  async stage(projectPath: string, paths: string[]): Promise<void> {
    const safe = this.validatePaths(paths);
    if (safe.length === 0) return;
    await this.gitBase.execGit(projectPath, ['add', '--', ...safe]);
  }

  /**
   * Unstage paths: `git restore --staged -- <paths>`. Files that were never
   * tracked (newly-added then unstaged) are handled gracefully — `git restore
   * --staged` resets them out of the index without error.
   */
  async unstage(projectPath: string, paths: string[]): Promise<void> {
    const safe = this.validatePaths(paths);
    if (safe.length === 0) return;
    const { stderr } = await this.gitBase.execGit(projectPath, [
      'restore',
      '--staged',
      '--',
      ...safe,
    ]);
    // On a repo with no commits yet, `restore --staged` can't resolve HEAD;
    // fall back to `git rm --cached` to drop the paths from the index.
    if (/fatal: could not resolve|unknown revision|ambiguous argument 'HEAD'/i.test(stderr)) {
      await this.gitBase.execGit(projectPath, ['rm', '--cached', '-r', '--', ...safe]);
    }
  }

  /**
   * Discard working-tree changes. Tracked paths are reverted with
   * `git restore -- <paths>`; explicitly-passed untracked paths are removed
   * with `git clean -f -- <paths>`. Never uses a wildcard — only the exact
   * paths supplied by the caller are cleaned.
   */
  async discard(projectPath: string, paths: string[]): Promise<void> {
    const safe = this.validatePaths(paths);
    if (safe.length === 0) return;

    const untrackedSet = new Set(await this.untrackedPaths(projectPath));
    const tracked = safe.filter(p => !untrackedSet.has(p));
    const untracked = safe.filter(p => untrackedSet.has(p));

    if (tracked.length > 0) {
      await this.gitBase.execGit(projectPath, ['restore', '--', ...tracked]);
    }
    if (untracked.length > 0) {
      // -f required by config; -- separates pathspec; never `-d`/wildcard.
      await this.gitBase.execGit(projectPath, ['clean', '-f', '--', ...untracked]);
    }
  }

  private async untrackedPaths(projectPath: string): Promise<string[]> {
    const { stdout } = await this.gitBase.execGit(projectPath, [
      'ls-files',
      '--others',
      '--exclude-standard',
    ]);
    return stdout.split(/\r?\n/).filter(Boolean);
  }

  // ==================== Hunk staging ====================

  /**
   * Stage a single hunk: pipe `patch` to `git apply --cached --unidiff-zero -`.
   * The patch must only touch `filePath`.
   */
  async stageHunk(projectPath: string, filePath: string, patch: string): Promise<void> {
    this.assertPathInRepo(filePath);
    this.assertPatchTouchesOnly(patch, filePath);
    await this.applyPatch(projectPath, patch, false);
  }

  /**
   * Unstage a single hunk: pipe `patch` reversed to
   * `git apply --cached --reverse --unidiff-zero -`.
   */
  async unstageHunk(projectPath: string, filePath: string, patch: string): Promise<void> {
    this.assertPathInRepo(filePath);
    this.assertPatchTouchesOnly(patch, filePath);
    await this.applyPatch(projectPath, patch, true);
  }

  private async applyPatch(projectPath: string, patch: string, reverse: boolean): Promise<void> {
    const args = ['apply', '--cached'];
    if (reverse) args.push('--reverse');
    args.push('--unidiff-zero', '-');
    const { stderr } = await this.gitBase.execGitWithStdin(
      projectPath,
      args,
      // Ensure a trailing newline — git apply rejects patches that don't end
      // in one ("corrupt patch at line N").
      patch.endsWith('\n') ? patch : `${patch}\n`
    );
    if (stderr && /error:|fatal:|corrupt patch|does not apply/i.test(stderr)) {
      throw new ScmError('PATCH_FAILED', `Failed to apply hunk: ${stderr.trim()}`);
    }
  }

  /**
   * Reject a patch that references any file other than `filePath`. Guards
   * against a malformed/hostile patch mutating files outside the user's
   * selection. Parses the `diff --git a/<x> b/<y>`, `--- a/<x>`, `+++ b/<y>`
   * and `rename from/to` headers.
   */
  private assertPatchTouchesOnly(patch: string, filePath: string): void {
    const referenced = new Set<string>();
    for (const raw of patch.split('\n')) {
      const line = raw.trimEnd();
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^diff --git a\/(.+?) b\/(.+)$/))) {
        referenced.add(this.unquotePath(m[1]));
        referenced.add(this.unquotePath(m[2]));
      } else if ((m = line.match(/^--- (?:a\/)?(.+)$/))) {
        const p = this.unquotePath(m[1]);
        if (p !== '/dev/null') referenced.add(p);
      } else if ((m = line.match(/^\+\+\+ (?:b\/)?(.+)$/))) {
        const p = this.unquotePath(m[1]);
        if (p !== '/dev/null') referenced.add(p);
      } else if ((m = line.match(/^rename (?:from|to) (.+)$/))) {
        referenced.add(this.unquotePath(m[1]));
      }
    }
    const normalizedTarget = this.normalizeRel(filePath);
    for (const ref of referenced) {
      if (this.normalizeRel(ref) !== normalizedTarget) {
        throw new ScmError(
          'INVALID_PATH',
          `Patch references '${ref}' but is only permitted to touch '${filePath}'`
        );
      }
    }
    if (referenced.size === 0) {
      throw new ScmError('PATCH_FAILED', 'Patch does not reference any file path');
    }
  }

  private unquotePath(p: string): string {
    const trimmed = p.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }
    return trimmed;
  }

  // ==================== Commit ====================

  /**
   * Create a commit via execFile arg-array (no shell interpolation), returning
   * the new commit hash. Maps the empty-index and hook-rejection cases to
   * typed errors.
   */
  async commit(
    projectPath: string,
    message: string,
    options: { amend?: boolean } = {}
  ): Promise<string> {
    if (!message || !message.trim()) {
      throw new ScmError('GIT_ERROR', 'Commit message must not be empty');
    }
    const args = ['commit', '-m', message];
    if (options.amend) args.push('--amend');

    const { stdout, stderr } = await this.gitBase.execGit(projectPath, args);
    const combined = `${stdout}\n${stderr}`;

    if (/nothing to commit|no changes added to commit|nothing added to commit/i.test(combined)) {
      throw new ScmError('NOTHING_TO_COMMIT', 'Nothing to commit');
    }
    if (
      /hook .*?(declined|failed)|pre-commit hook|commit-msg hook|cannot run hook/i.test(combined)
    ) {
      throw new ScmError('HOOK_FAILED', `Commit hook failed: ${stderr.trim() || stdout.trim()}`);
    }

    const { stdout: headOut } = await this.gitBase.execGit(projectPath, ['rev-parse', 'HEAD']);
    const hash = headOut.trim();
    if (!/^[0-9a-f]{40}$/i.test(hash)) {
      // rev-parse didn't yield a hash — the commit almost certainly failed.
      throw new ScmError('GIT_ERROR', `Commit failed: ${stderr.trim() || stdout.trim()}`);
    }
    return hash;
  }

  // ==================== Remote sync ====================

  /** `git fetch <remote>`. Maps a missing remote to NO_REMOTE. */
  async fetch(projectPath: string, remote = 'origin'): Promise<void> {
    const { stderr } = await this.gitBase.execGit(projectPath, ['fetch', remote]);
    this.assertRemoteOk(stderr);
  }

  /**
   * `git pull --ff-only <remote>`. Fast-forward only by design — a diverged
   * history yields a DIVERGED error rather than creating a merge commit.
   */
  async pull(projectPath: string, remote = 'origin'): Promise<void> {
    const { stdout, stderr } = await this.gitBase.execGit(projectPath, [
      'pull',
      '--ff-only',
      remote,
    ]);
    const combined = `${stdout}\n${stderr}`;
    if (/not possible to fast-forward|divergent branches|cannot fast-forward/i.test(combined)) {
      throw new ScmError('DIVERGED', 'Local and remote histories have diverged (ff-only pull)');
    }
    this.assertRemoteOk(combined);
  }

  /**
   * Push the current branch. When the branch has no upstream, sets it with
   * `-u <remote> <branch>`; otherwise a plain `git push`.
   */
  async push(projectPath: string, remote = 'origin'): Promise<void> {
    const upstream = await this.getUpstream(projectPath);
    let stderr: string;
    if (upstream) {
      ({ stderr } = await this.gitBase.execGit(projectPath, ['push']));
    } else {
      const branch = await this.getCurrentBranch(projectPath);
      if (!branch) {
        throw new ScmError('GIT_ERROR', 'Cannot push from a detached HEAD');
      }
      ({ stderr } = await this.gitBase.execGit(projectPath, ['push', '-u', remote, branch]));
    }
    if (/\[rejected\]|non-fast-forward|fetch first/i.test(stderr)) {
      throw new ScmError('DIVERGED', 'Push rejected — remote has commits you do not have');
    }
    this.assertRemoteOk(stderr);
  }

  /** Map common remote failures (no remote, auth) to typed errors. */
  private assertRemoteOk(output: string): void {
    if (
      /does not appear to be a git repository|No such remote|no configured push destination/i.test(
        output
      )
    ) {
      throw new ScmError('NO_REMOTE', 'No remote configured');
    }
    if (
      /Authentication failed|could not read Username|Permission denied \(publickey\)|403 Forbidden|401 Unauthorized/i.test(
        output
      )
    ) {
      throw new ScmError('AUTH_FAILED', 'Remote authentication failed');
    }
    if (/no tracking information|no upstream/i.test(output)) {
      throw new ScmError('NO_UPSTREAM', 'The current branch has no upstream');
    }
    if (/fatal:/i.test(output)) {
      throw new ScmError('GIT_ERROR', output.trim());
    }
  }

  private async getUpstream(projectPath: string): Promise<string | undefined> {
    const { stdout } = await this.gitBase.execGit(projectPath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ]);
    const value = stdout.trim();
    return value || undefined;
  }

  private async getCurrentBranch(projectPath: string): Promise<string | undefined> {
    const { stdout } = await this.gitBase.execGit(projectPath, [
      'rev-parse',
      '--abbrev-ref',
      'HEAD',
    ]);
    const value = stdout.trim();
    return value && value !== 'HEAD' ? value : undefined;
  }

  // ==================== History ====================

  /**
   * Paginated commit log. Returns up to `limit` commits, oldest paging anchor
   * exposed via `nextBeforeSha`. `beforeSha` continues from a previous page
   * (exclusive of that commit).
   */
  async log(
    projectPath: string,
    options: { limit?: number; beforeSha?: string } = {}
  ): Promise<{ commits: ScmLogEntry[]; nextBeforeSha?: string }> {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 1000));
    if (options.beforeSha) this.assertSha(options.beforeSha);

    // Fields: hash, parents, authorName, authorEmail, authoredDate(ISO), subject, refs
    const format = ['%H', '%P', '%an', '%ae', '%aI', '%s', '%D'].join('%x00');

    // Fetch limit+1 to know whether another page exists. When paging from a
    // sha, request that sha's ancestors only (exclusive of the anchor itself).
    const range = options.beforeSha ? `${options.beforeSha}~1` : 'HEAD';
    const args = ['log', `--format=${format}`, '--decorate=short', `-n${limit + 1}`, range];

    const { stdout, stderr } = await this.gitBase.execGit(projectPath, args);
    if (/unknown revision|bad revision|does not have any commits yet/i.test(stderr)) {
      return { commits: [] };
    }

    const commits = this.parseLog(stdout);
    let nextBeforeSha: string | undefined;
    if (commits.length > limit) {
      const overflow = commits.pop()!;
      nextBeforeSha = overflow.hash;
    }
    return { commits, nextBeforeSha };
  }

  /** Parse the NUL-delimited `git log` output. Exposed for unit tests. */
  parseLog(stdout: string): ScmLogEntry[] {
    const entries: ScmLogEntry[] = [];
    // Records are newline-separated; each record has 7 NUL-separated fields.
    for (const record of stdout.split('\n')) {
      if (!record) continue;
      const parts = record.split(NUL);
      if (parts.length < 7) continue;
      const [hash, parents, authorName, authorEmail, authoredDate, subject, refs] = parts;
      entries.push({
        hash,
        shortHash: hash.slice(0, 7),
        parents: parents ? parents.split(' ').filter(Boolean) : [],
        authorName,
        authorEmail,
        authoredDate,
        subject,
        refs: refs ? refs.split(', ').filter(Boolean) : [],
      });
    }
    return entries;
  }

  /**
   * Files changed by a single commit, with per-file add/delete stats. Uses
   * `git show --numstat --name-status` parsing via two cheap exec calls.
   */
  async showCommit(projectPath: string, sha: string): Promise<ScmShowCommitResponse> {
    this.assertSha(sha);

    // name-status gives status letters + rename paths; numstat gives counts.
    const { stdout: nameStatus } = await this.gitBase.execGit(projectPath, [
      'show',
      '--no-color',
      '--format=',
      '--name-status',
      '-M',
      sha,
    ]);
    const { stdout: numstat } = await this.gitBase.execGit(projectPath, [
      'show',
      '--no-color',
      '--format=',
      '--numstat',
      '-M',
      sha,
    ]);

    const stats = this.parseNumstat(numstat);
    const files = this.parseNameStatus(nameStatus, stats);

    return { hash: sha, files };
  }

  private parseNumstat(
    stdout: string
  ): Map<string, { additions: number; deletions: number; isBinary: boolean }> {
    const map = new Map<string, { additions: number; deletions: number; isBinary: boolean }>();
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const [adds, dels, ...pathParts] = parts;
      const pathField = pathParts.join('\t');
      // For renames numstat path field is "old => new" or with braces; key on
      // the resolved new path so name-status can join on it.
      const resolved = this.resolveNumstatPath(pathField);
      const isBinary = adds === '-' && dels === '-';
      map.set(resolved, {
        additions: isBinary ? 0 : parseInt(adds, 10) || 0,
        deletions: isBinary ? 0 : parseInt(dels, 10) || 0,
        isBinary,
      });
    }
    return map;
  }

  private resolveNumstatPath(field: string): string {
    // Forms: "new", "old => new", "dir/{old => new}/file".
    const braceMatch = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/);
    if (braceMatch) {
      return `${braceMatch[1]}${braceMatch[3]}${braceMatch[4]}`;
    }
    const arrowMatch = field.match(/^(.*) => (.*)$/);
    if (arrowMatch) {
      return arrowMatch[2];
    }
    return field;
  }

  private parseNameStatus(
    stdout: string,
    stats: Map<string, { additions: number; deletions: number; isBinary: boolean }>
  ): ScmCommitFile[] {
    const files: ScmCommitFile[] = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      const code = parts[0];
      let path: string;
      let oldPath: string | undefined;
      if (code.startsWith('R') || code.startsWith('C')) {
        // R<score>\t<old>\t<new>
        oldPath = parts[1];
        path = parts[2];
      } else {
        path = parts[1];
      }
      const stat = stats.get(path) ?? { additions: 0, deletions: 0, isBinary: false };
      files.push({
        path,
        oldPath,
        status: this.statusFromCode(code[0]),
        additions: stat.additions,
        deletions: stat.deletions,
        isBinary: stat.isBinary,
      });
    }
    return files;
  }

  /**
   * Diff of one file within a commit. Returns the same {@link GitFileDiff}
   * structure the working-tree diff produces, by reusing GitDiffService's
   * unified-diff parser.
   */
  async commitFileDiff(projectPath: string, sha: string, path: string): Promise<ScmDiffResponse> {
    this.assertSha(sha);
    this.assertPathInRepo(path);
    const { stdout } = await this.gitBase.execGit(projectPath, [
      'show',
      '--no-color',
      '--format=',
      '-M',
      sha,
      '--',
      path,
    ]);
    const files = this.gitDiff.parseUnifiedDiff(stdout);
    return { file: files[0] };
  }

  /**
   * Diff of one working-tree file. `staged: true` diffs the index against
   * HEAD; otherwise the worktree against the index. Reuses GitDiffService's
   * parser so the UI renders it identically to commit diffs.
   */
  async fileDiff(
    projectPath: string,
    path: string,
    options: { staged?: boolean } = {}
  ): Promise<ScmDiffResponse> {
    this.assertPathInRepo(path);
    const args = ['diff', '--no-color', '--unified=3'];
    if (options.staged) args.push('--cached');
    args.push('--', path);
    const { stdout } = await this.gitBase.execGit(projectPath, args);
    const files = this.gitDiff.parseUnifiedDiff(stdout);
    return { file: files[0] };
  }

  // ==================== In-progress state ====================

  private async inProgress(projectPath: string, gitPathName: string): Promise<boolean> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--verify',
        '--quiet',
        gitPathName,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Detect an in-progress rebase by resolving the rebase-merge / rebase-apply
   * dirs via `git rev-parse --git-path` (worktree-correct) and testing them on
   * disk. Mirrors GitStatusService.checkRebaseState's batched-rev-parse pattern.
   */
  private async rebaseInProgress(projectPath: string): Promise<boolean> {
    try {
      const { stdout } = await this.gitBase.execGit(projectPath, [
        'rev-parse',
        '--git-path',
        'rebase-merge',
        '--git-path',
        'rebase-apply',
      ]);
      const candidates = stdout
        .trim()
        .split('\n')
        .map(p => p.trim())
        .filter(Boolean);
      for (const rel of candidates) {
        if (existsSync(resolve(projectPath, rel))) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ==================== Validation ====================

  /** Validate that `sha` looks like a git revision (no flag/control injection). */
  private assertSha(sha: string): void {
    if (!sha || typeof sha !== 'string') {
      throw new ScmError('GIT_ERROR', 'Commit SHA is required');
    }
    // Allowlist of characters valid in a git revspec (hashes, ref names,
    // `~`/`^`/`@` navigation). The allowlist implicitly rejects whitespace and
    // control bytes; the leading-dash guard prevents flag injection.
    if (sha.startsWith('-') || !/^[0-9a-zA-Z._/^~@-]+$/.test(sha)) {
      throw new ScmError('INVALID_PATH', `Invalid commit reference: ${sha}`);
    }
  }

  /**
   * Filter + validate a set of caller-supplied pathspecs, ensuring each stays
   * inside the repo root (relative, no `..` escape, not absolute, no flag
   * injection). Throws {@link ScmError} INVALID_PATH on the first offender.
   */
  private validatePaths(paths: string[]): string[] {
    if (!Array.isArray(paths)) {
      throw new ScmError('INVALID_PATH', 'paths must be an array');
    }
    const out: string[] = [];
    for (const p of paths) {
      this.assertPathInRepo(p);
      out.push(p);
    }
    return out;
  }

  /**
   * Reject a path that is absent, absolute, escapes the repo root via `..`,
   * contains control characters, or would be interpreted as a git flag. Paths
   * are repo-root-relative pathspecs; the leading `--` separator in each git
   * invocation already prevents flag interpretation, but we defend in depth.
   */
  private assertPathInRepo(p: unknown): void {
    if (typeof p !== 'string' || p.length === 0) {
      throw new ScmError('INVALID_PATH', 'Path must be a non-empty string');
    }
    if (p.includes('\n') || p.includes('\r') || p.includes(NUL)) {
      throw new ScmError('INVALID_PATH', 'Path contains control characters');
    }
    if (isAbsolute(p)) {
      throw new ScmError('INVALID_PATH', `Path must be repo-relative, got absolute: ${p}`);
    }
    // Defense in depth: although every git invocation places the pathspec after
    // a `--` separator (so a leading dash can't be read as a flag), reject it
    // anyway — Omniscribe never needs to operate on dash-leading filenames.
    if (p.startsWith('-')) {
      throw new ScmError('INVALID_PATH', `Path must not start with '-': ${p}`);
    }
    const normalized = normalize(p);
    if (normalized === '..' || normalized.startsWith(`..${sep}`) || normalized.startsWith('../')) {
      throw new ScmError('INVALID_PATH', `Path escapes the repository root: ${p}`);
    }
  }

  private normalizeRel(p: string): string {
    return normalize(p).split(sep).join('/');
  }
}

/** Helper for gateways: build the canonical scm:changed broadcast payload. */
export function scmChanged(projectPath: string): ScmChangedEvent {
  return { projectPath };
}
