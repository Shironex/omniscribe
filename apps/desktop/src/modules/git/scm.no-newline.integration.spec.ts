/**
 * No-newline-at-EOF round-trip integration test.
 *
 * Exercises the FULL hunk-staging pipeline against a REAL git repository — no
 * mocks: real `git diff` output is parsed by GitDiffService, the parsed hunk
 * (carrying the new `old/newNoNewlineAtEof` flags) is reconstructed into a
 * single-hunk patch using the same marker-placement rules as the web's
 * buildHunkPatch, and the patch is piped through the real ScmService.stageHunk
 * (`git apply --cached --unidiff-zero -`). The assertion is that git ACCEPTS the
 * patch and the staged blob preserves the missing trailing newline — which is
 * exactly what regressed when the marker was dropped.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { GitDiffHunk, GitDiffLine } from '@omniscribe/shared';
import { GitBaseService } from './git-base.service';
import { GitRepoService } from './git-repo.service';
import { GitBranchService } from './git-branch.service';
import { GitStatusService } from './git-status.service';
import { GitDiffService } from './git-diff.service';
import { ScmService } from './scm.service';

const NO_NEWLINE_MARKER = '\\ No newline at end of file';

/** Run git synchronously in `cwd` (used only for fixture setup + assertions). */
function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  });
}

/**
 * Run `git apply --check --cached --unidiff-zero -` with `patch` on stdin.
 * Throws (failing the test) if git rejects the reconstructed patch.
 */
function gitApplyCheck(cwd: string, patch: string): void {
  execFileSync('git', ['apply', '--check', '--cached', '--unidiff-zero', '-'], {
    cwd,
    input: patch,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
  });
}

/**
 * Reconstruct a single-hunk forward patch from a parsed hunk, re-emitting the
 * `\ No newline at end of file` marker from the hunk's side flags. This mirrors
 * apps/web buildHunkPatch's marker placement so the integration test proves the
 * parser→reconstruct→apply contract end-to-end with real git.
 */
function reconstructPatch(path: string, hunk: GitDiffHunk): string {
  let oldCount = 0;
  let newCount = 0;
  for (const l of hunk.lines) {
    if (l.type === 'context') {
      oldCount++;
      newCount++;
    } else if (l.type === 'deletion') {
      oldCount++;
    } else {
      newCount++;
    }
  }

  const lastOldIdx = lastIndex(hunk.lines, t => t !== 'addition');
  const lastNewIdx = lastIndex(hunk.lines, t => t !== 'deletion');

  const out: string[] = [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`,
  ];
  for (let i = 0; i < hunk.lines.length; i++) {
    const line = hunk.lines[i];
    const prefix = line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';
    out.push(`${prefix}${line.content}`);
    const closesOld = hunk.oldNoNewlineAtEof && i === lastOldIdx;
    const closesNew = hunk.newNoNewlineAtEof && i === lastNewIdx;
    if (closesOld || closesNew) out.push(NO_NEWLINE_MARKER);
  }
  return `${out.join('\n')}\n`;
}

function lastIndex(lines: GitDiffLine[], belongs: (t: GitDiffLine['type']) => boolean): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (belongs(lines[i].type)) return i;
  }
  return -1;
}

describe('No-newline-at-EOF hunk staging (real git)', () => {
  let repo: string;
  let scm: ScmService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitBaseService,
        GitRepoService,
        GitBranchService,
        GitStatusService,
        GitDiffService,
        ScmService,
      ],
    }).compile();
    scm = module.get(ScmService);
  });

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'omni-nonl-'));
    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    git(repo, 'config', 'commit.gpgsign', 'false');
    git(repo, 'config', 'core.autocrlf', 'false');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  /** Write `content` verbatim (no implicit newline) and commit it. */
  function commitFile(name: string, content: string): void {
    writeFileSync(join(repo, name), content);
    git(repo, 'add', name);
    git(repo, 'commit', '-q', '-m', `add ${name}`);
  }

  it('parses the new-side marker when a trailing newline is removed', async () => {
    // Old has a trailing newline; new strips it (marker on NEW side only).
    commitFile('a.txt', 'line one\nline two\n');
    writeFileSync(join(repo, 'a.txt'), 'line one\nline two');

    const res = await scm.fileDiff(repo, 'a.txt');
    const hunk = res.file!.hunks[0];
    expect(hunk.newNoNewlineAtEof).toBe(true);
    expect(hunk.oldNoNewlineAtEof).toBeFalsy();

    const patch = reconstructPatch('a.txt', hunk);
    // Real git must accept the reconstructed patch.
    expect(() => gitApplyCheck(repo, patch)).not.toThrow();
  });

  it('round-trips through ScmService.stageHunk and preserves the missing newline', async () => {
    commitFile('a.txt', 'line one\nline two\n');
    writeFileSync(join(repo, 'a.txt'), 'line one\nline two');

    const res = await scm.fileDiff(repo, 'a.txt');
    const patch = reconstructPatch('a.txt', res.file!.hunks[0]);

    // Real apply via the service (pipes to `git apply --cached --unidiff-zero -`).
    await expect(scm.stageHunk(repo, 'a.txt', patch)).resolves.toBeUndefined();

    // The staged blob must end without a newline — i.e. the marker survived.
    const staged = git(repo, 'show', ':a.txt');
    expect(staged.endsWith('\n')).toBe(false);
    expect(staged).toBe('line one\nline two');
  });

  it('parses the old-side marker when a trailing newline is added', async () => {
    // Old has NO trailing newline; new adds one (marker on OLD side only).
    commitFile('b.txt', 'only line');
    writeFileSync(join(repo, 'b.txt'), 'only line\n');

    const res = await scm.fileDiff(repo, 'b.txt');
    const hunk = res.file!.hunks[0];
    expect(hunk.oldNoNewlineAtEof).toBe(true);
    expect(hunk.newNoNewlineAtEof).toBeFalsy();

    const patch = reconstructPatch('b.txt', hunk);
    expect(() => gitApplyCheck(repo, patch)).not.toThrow();
  });

  it('parses both-side markers when an EOF-less line is edited', async () => {
    // Both old and new lack a trailing newline (marker on BOTH sides).
    commitFile('c.txt', 'before');
    writeFileSync(join(repo, 'c.txt'), 'after');

    const res = await scm.fileDiff(repo, 'c.txt');
    const hunk = res.file!.hunks[0];
    expect(hunk.oldNoNewlineAtEof).toBe(true);
    expect(hunk.newNoNewlineAtEof).toBe(true);

    const patch = reconstructPatch('c.txt', hunk);
    await expect(scm.stageHunk(repo, 'c.txt', patch)).resolves.toBeUndefined();
    const staged = git(repo, 'show', ':c.txt');
    expect(staged).toBe('after');
  });
});
