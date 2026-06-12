import { Test, TestingModule } from '@nestjs/testing';
import { ScmService, ScmError } from './scm.service';
import { GitBaseService } from './git-base.service';
import { GitRepoService } from './git-repo.service';
import { GitDiffService } from './git-diff.service';

/**
 * Build a porcelain v2 line for an ordinary changed entry.
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 */
function v2Ordinary(xy: string, path: string): string {
  return `1 ${xy} N... 100644 100644 100644 0000000 0000000 ${path}`;
}

/**
 * Build a porcelain v2 line for a rename entry.
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path>\t<origPath>
 */
function v2Rename(xy: string, newPath: string, oldPath: string): string {
  return `2 ${xy} N... 100644 100644 100644 0000000 0000000 R100 ${newPath}\t${oldPath}`;
}

/**
 * Build a porcelain v2 unmerged (conflict) entry.
 *   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 */
function v2Unmerged(xy: string, path: string): string {
  return `u ${xy} N... 100644 100644 100644 100644 0000000 0000000 0000000 ${path}`;
}

describe('ScmService', () => {
  let service: ScmService;
  let gitBase: jest.Mocked<GitBaseService>;
  let gitRepo: jest.Mocked<GitRepoService>;
  let gitDiff: jest.Mocked<GitDiffService>;

  beforeEach(async () => {
    gitBase = {
      execGit: jest.fn(),
      execGitWithStdin: jest.fn(),
    } as unknown as jest.Mocked<GitBaseService>;

    gitRepo = {
      isGitRepository: jest.fn(),
      getRepositoryRoot: jest.fn(),
    } as unknown as jest.Mocked<GitRepoService>;

    gitDiff = {
      parseUnifiedDiff: jest.fn(),
    } as unknown as jest.Mocked<GitDiffService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScmService,
        { provide: GitBaseService, useValue: gitBase },
        { provide: GitRepoService, useValue: gitRepo },
        { provide: GitDiffService, useValue: gitDiff },
      ],
    }).compile();

    service = module.get<ScmService>(ScmService);
  });

  // ========================================================================
  // panelSnapshot + porcelain v2 parsing
  // ========================================================================

  describe('panelSnapshot', () => {
    it('returns the not-a-repo shape when path is not a git repo', async () => {
      gitRepo.isGitRepository.mockResolvedValue(false);

      const snap = await service.panelSnapshot('/not/a/repo');

      expect(snap.isRepo).toBe(false);
      expect(snap.staged).toEqual([]);
      expect(snap.unstaged).toEqual([]);
      expect(snap.untracked).toEqual([]);
      expect(snap.conflicted).toEqual([]);
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('parses branch, upstream, ahead/behind and change buckets in one snapshot', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');

      const status = [
        '# branch.oid abc123',
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +2 -1',
        v2Ordinary('M.', 'staged-only.ts'), // staged modified
        v2Ordinary('.M', 'unstaged-only.ts'), // unstaged modified
        v2Ordinary('MM', 'both.ts'), // staged + unstaged
        v2Ordinary('A.', 'added.ts'), // staged add
        '? new.ts', // untracked
      ].join('\n');

      gitBase.execGit
        .mockResolvedValueOnce({ stdout: status, stderr: '' }) // status
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // MERGE_HEAD rev-parse
        .mockResolvedValueOnce({
          stdout: '/repo/.git/rebase-merge\n/repo/.git/rebase-apply',
          stderr: '',
        }); // rebase paths

      const snap = await service.panelSnapshot('/repo');

      expect(snap.isRepo).toBe(true);
      expect(snap.rootPath).toBe('/repo');
      expect(snap.branch).toBe('main');
      expect(snap.upstream).toBe('origin/main');
      expect(snap.ahead).toBe(2);
      expect(snap.behind).toBe(1);

      expect(snap.staged.map(f => f.path).sort()).toEqual(
        ['added.ts', 'both.ts', 'staged-only.ts'].sort()
      );
      expect(snap.unstaged.map(f => f.path).sort()).toEqual(['both.ts', 'unstaged-only.ts'].sort());
      expect(snap.untracked.map(f => f.path)).toEqual(['new.ts']);

      // status flag uses the batched single status exec
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'status',
        '--porcelain=v2',
        '--branch',
        '--untracked-files=all',
      ]);
    });

    it('handles a rename entry (oldPath on staged side)', () => {
      const parsed = service.parsePorcelainV2(
        [
          '# branch.head main',
          '# branch.ab +0 -0',
          v2Rename('R.', 'new-name.ts', 'old-name.ts'),
        ].join('\n')
      );
      expect(parsed.staged).toEqual([
        { path: 'new-name.ts', oldPath: 'old-name.ts', status: 'renamed', xy: 'R.' },
      ]);
      expect(parsed.unstaged).toEqual([]);
    });

    it('captures unmerged entries in the conflicted bucket', () => {
      const parsed = service.parsePorcelainV2(
        ['# branch.head main', '# branch.ab +0 -0', v2Unmerged('UU', 'conflict.ts')].join('\n')
      );
      expect(parsed.conflicted).toEqual([{ path: 'conflict.ts', status: 'conflicted', xy: 'UU' }]);
    });

    it('reports detached HEAD with a short oid and no branch', () => {
      const parsed = service.parsePorcelainV2(
        ['# branch.oid deadbeefcafebabe1234', '# branch.head (detached)'].join('\n')
      );
      expect(parsed.branch).toBeUndefined();
      expect(parsed.detachedHead).toBe('deadbee');
    });

    it('sets merge/rebase flags from disk + rev-parse probes', async () => {
      gitRepo.isGitRepository.mockResolvedValue(true);
      gitRepo.getRepositoryRoot.mockResolvedValue('/repo');
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: '# branch.head main\n', stderr: '' }) // status
        .mockResolvedValueOnce({ stdout: 'mergehash\n', stderr: '' }) // MERGE_HEAD exists
        .mockResolvedValueOnce({ stdout: '/nonexistent/rebase-merge', stderr: '' }); // rebase dirs absent on disk

      const snap = await service.panelSnapshot('/repo');
      expect(snap.isMerging).toBe(true);
      expect(snap.isRebasing).toBe(false);
    });
  });

  // ========================================================================
  // stage / unstage / discard — pathspec safety
  // ========================================================================

  describe('stage', () => {
    it('runs git add -- with the paths', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });
      await service.stage('/repo', ['a.ts', 'dir/b.ts']);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['add', '--', 'a.ts', 'dir/b.ts']);
    });

    it('no-ops on an empty path list', async () => {
      await service.stage('/repo', []);
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it.each([
      ['absolute path', '/etc/passwd'],
      ['parent escape', '../secrets'],
      ['nested parent escape', 'foo/../../bar'],
      ['flag injection', '--output=/tmp/x'],
    ])('rejects %s', async (_label, badPath) => {
      await expect(service.stage('/repo', [badPath])).rejects.toBeInstanceOf(ScmError);
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('rejects paths containing newlines', async () => {
      await expect(service.stage('/repo', ['ok.ts\nrm -rf'])).rejects.toBeInstanceOf(ScmError);
    });
  });

  describe('unstage', () => {
    it('runs git restore --staged --', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });
      await service.unstage('/repo', ['a.ts']);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['restore', '--staged', '--', 'a.ts']);
    });

    it('falls back to rm --cached on a repo with no HEAD yet', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'fatal: could not resolve HEAD',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.unstage('/repo', ['a.ts']);

      expect(gitBase.execGit).toHaveBeenNthCalledWith(2, '/repo', [
        'rm',
        '--cached',
        '-r',
        '--',
        'a.ts',
      ]);
    });
  });

  describe('discard', () => {
    it('restores tracked paths and cleans only explicitly-passed untracked paths', async () => {
      // ls-files --others reports b.ts as untracked
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: 'b.ts\n', stderr: '' }) // untrackedPaths
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // restore tracked
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // clean untracked

      await service.discard('/repo', ['a.ts', 'b.ts']);

      expect(gitBase.execGit).toHaveBeenNthCalledWith(2, '/repo', ['restore', '--', 'a.ts']);
      expect(gitBase.execGit).toHaveBeenNthCalledWith(3, '/repo', ['clean', '-f', '--', 'b.ts']);
    });

    it('never runs clean with a wildcard (only exact untracked paths)', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: 'junk.ts\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: '', stderr: '' });

      await service.discard('/repo', ['junk.ts']);

      const cleanCall = gitBase.execGit.mock.calls.find(c => c[1][0] === 'clean');
      expect(cleanCall?.[1]).toEqual(['clean', '-f', '--', 'junk.ts']);
      expect(cleanCall?.[1]).not.toContain('-d');
      expect(cleanCall?.[1]).not.toContain('.');
    });

    it('rejects an escaping path before touching git', async () => {
      await expect(service.discard('/repo', ['../x'])).rejects.toBeInstanceOf(ScmError);
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // hunk staging — apply arg construction + stdin + scoping
  // ========================================================================

  describe('stageHunk / unstageHunk', () => {
    const patch = [
      'diff --git a/file.ts b/file.ts',
      '--- a/file.ts',
      '+++ b/file.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    it('pipes the patch to git apply --cached --unidiff-zero - via stdin', async () => {
      gitBase.execGitWithStdin.mockResolvedValue({ stdout: '', stderr: '' });

      await service.stageHunk('/repo', 'file.ts', patch);

      const [cwd, args, stdin] = gitBase.execGitWithStdin.mock.calls[0];
      expect(cwd).toBe('/repo');
      expect(args).toEqual(['apply', '--cached', '--unidiff-zero', '-']);
      expect(stdin).toBe(patch + '\n'); // trailing newline ensured
    });

    it('adds --reverse for unstageHunk', async () => {
      gitBase.execGitWithStdin.mockResolvedValue({ stdout: '', stderr: '' });

      await service.unstageHunk('/repo', 'file.ts', patch);

      const [, args] = gitBase.execGitWithStdin.mock.calls[0];
      expect(args).toEqual(['apply', '--cached', '--reverse', '--unidiff-zero', '-']);
    });

    it('does not append a second newline when the patch already ends in one', async () => {
      gitBase.execGitWithStdin.mockResolvedValue({ stdout: '', stderr: '' });
      await service.stageHunk('/repo', 'file.ts', patch + '\n');
      const [, , stdin] = gitBase.execGitWithStdin.mock.calls[0];
      expect(stdin).toBe(patch + '\n');
    });

    it('rejects a patch that references a different file', async () => {
      const sneaky = [
        'diff --git a/file.ts b/file.ts',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1 +1 @@',
        '-old',
        '+new',
        'diff --git a/other.ts b/other.ts',
        '--- a/other.ts',
        '+++ b/other.ts',
        '@@ -1 +1 @@',
        '-x',
        '+y',
      ].join('\n');

      await expect(service.stageHunk('/repo', 'file.ts', sneaky)).rejects.toBeInstanceOf(ScmError);
      expect(gitBase.execGitWithStdin).not.toHaveBeenCalled();
    });

    it('maps a git-apply failure to a PATCH_FAILED ScmError', async () => {
      gitBase.execGitWithStdin.mockResolvedValue({
        stdout: '',
        stderr: 'error: patch does not apply',
      });

      await expect(service.stageHunk('/repo', 'file.ts', patch)).rejects.toMatchObject({
        code: 'PATCH_FAILED',
      });
    });

    it('rejects a hunk for a path outside the repo', async () => {
      await expect(service.stageHunk('/repo', '../escape.ts', patch)).rejects.toBeInstanceOf(
        ScmError
      );
    });
  });

  // ========================================================================
  // commit — arg construction + error mapping
  // ========================================================================

  describe('commit', () => {
    it('commits with -m and returns the new hash', async () => {
      const hash = 'a'.repeat(40);
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: '[main 1234567] msg', stderr: '' }) // commit
        .mockResolvedValueOnce({ stdout: `${hash}\n`, stderr: '' }); // rev-parse HEAD

      const result = await service.commit('/repo', 'my message');

      expect(gitBase.execGit).toHaveBeenNthCalledWith(1, '/repo', ['commit', '-m', 'my message']);
      expect(result).toBe(hash);
    });

    it('passes --amend when requested', async () => {
      const hash = 'b'.repeat(40);
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: '[main 1234567] amended', stderr: '' })
        .mockResolvedValueOnce({ stdout: `${hash}\n`, stderr: '' });

      await service.commit('/repo', 'amended', { amend: true });

      expect(gitBase.execGit).toHaveBeenNthCalledWith(1, '/repo', [
        'commit',
        '-m',
        'amended',
        '--amend',
      ]);
    });

    it('maps "nothing to commit" to NOTHING_TO_COMMIT', async () => {
      gitBase.execGit.mockResolvedValueOnce({
        stdout: 'nothing to commit, working tree clean',
        stderr: '',
      });

      await expect(service.commit('/repo', 'msg')).rejects.toMatchObject({
        code: 'NOTHING_TO_COMMIT',
      });
    });

    it('maps a rejecting pre-commit hook to HOOK_FAILED', async () => {
      gitBase.execGit.mockResolvedValueOnce({
        stdout: '',
        stderr: 'pre-commit hook failed (exit code 1)',
      });

      await expect(service.commit('/repo', 'msg')).rejects.toMatchObject({
        code: 'HOOK_FAILED',
      });
    });

    it('rejects an empty message before shelling out', async () => {
      await expect(service.commit('/repo', '   ')).rejects.toMatchObject({ code: 'GIT_ERROR' });
      expect(gitBase.execGit).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // remote sync — fetch / pull (ff-only) / push
  // ========================================================================

  describe('fetch / pull / push', () => {
    it('fetch runs git fetch <remote>', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });
      await service.fetch('/repo', 'origin');
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['fetch', 'origin']);
    });

    it('pull runs git pull --ff-only', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'Already up to date.', stderr: '' });
      await service.pull('/repo', 'origin');
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['pull', '--ff-only', 'origin']);
    });

    it('pull maps a diverged history to DIVERGED', async () => {
      gitBase.execGit.mockResolvedValue({
        stdout: '',
        stderr: 'fatal: Not possible to fast-forward, aborting.',
      });
      await expect(service.pull('/repo', 'origin')).rejects.toMatchObject({ code: 'DIVERGED' });
    });

    it('push sets upstream with -u when none is configured', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: no upstream configured' }) // @{upstream}
        .mockResolvedValueOnce({ stdout: 'feature/x\n', stderr: '' }) // current branch
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // push

      await service.push('/repo', 'origin');

      expect(gitBase.execGit).toHaveBeenLastCalledWith('/repo', [
        'push',
        '-u',
        'origin',
        'feature/x',
      ]);
    });

    it('push runs a plain push when an upstream exists', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: 'origin/main\n', stderr: '' }) // @{upstream}
        .mockResolvedValueOnce({ stdout: '', stderr: '' }); // push

      await service.push('/repo', 'origin');

      expect(gitBase.execGit).toHaveBeenLastCalledWith('/repo', ['push']);
    });

    it('push maps a rejected non-fast-forward to DIVERGED', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: 'origin/main\n', stderr: '' })
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '! [rejected] main -> main (non-fast-forward)',
        });

      await expect(service.push('/repo', 'origin')).rejects.toMatchObject({ code: 'DIVERGED' });
    });

    it('fetch maps an auth failure to AUTH_FAILED', async () => {
      gitBase.execGit.mockResolvedValue({
        stdout: '',
        stderr: 'fatal: Authentication failed for https://example.com/x.git',
      });
      await expect(service.fetch('/repo', 'origin')).rejects.toMatchObject({
        code: 'AUTH_FAILED',
      });
    });
  });

  // ========================================================================
  // log — pagination + parsing
  // ========================================================================

  describe('log', () => {
    const NUL = '\x00';
    function logRecord(hash: string, parents = '', subject = 'subject', refs = ''): string {
      return [
        hash,
        parents,
        'Author',
        'a@example.com',
        '2024-01-01T00:00:00+00:00',
        subject,
        refs,
      ].join(NUL);
    }

    it('requests limit+1 commits from HEAD and clamps the page', async () => {
      const records = [
        logRecord('h1', 'h0', 'first', 'HEAD -> main, origin/main'),
        logRecord('h2', 'h1', 'second'),
        logRecord('h3', 'h2', 'third'), // overflow row (limit=2)
      ].join('\n');
      gitBase.execGit.mockResolvedValue({ stdout: records, stderr: '' });

      const { commits, nextBeforeSha } = await service.log('/repo', { limit: 2 });

      const args = gitBase.execGit.mock.calls[0][1];
      expect(args).toContain('-n3'); // limit + 1
      expect(args).toContain('--decorate=short');
      expect(args[args.length - 1]).toBe('HEAD');

      expect(commits).toHaveLength(2);
      expect(commits[0].hash).toBe('h1');
      expect(commits[0].refs).toEqual(['HEAD -> main', 'origin/main']);
      expect(commits[0].parents).toEqual(['h0']);
      expect(nextBeforeSha).toBe('h3');
    });

    it('pages from beforeSha~1 (exclusive of the anchor)', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: logRecord('h5', 'h4'), stderr: '' });

      await service.log('/repo', { limit: 10, beforeSha: 'h6' });

      const args = gitBase.execGit.mock.calls[0][1];
      expect(args[args.length - 1]).toBe('h6~1');
    });

    it('rejects an injection-shaped beforeSha', async () => {
      await expect(service.log('/repo', { beforeSha: '--output=/tmp/x' })).rejects.toBeInstanceOf(
        ScmError
      );
    });

    it('returns an empty page on a repo with no commits', async () => {
      gitBase.execGit.mockResolvedValue({
        stdout: '',
        stderr: "fatal: your current branch 'main' does not have any commits yet",
      });
      const { commits } = await service.log('/repo');
      expect(commits).toEqual([]);
    });
  });

  // ========================================================================
  // showCommit / commitFileDiff / fileDiff
  // ========================================================================

  describe('showCommit', () => {
    it('joins name-status with numstat for per-file stats', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({
          stdout: ['M\tsrc/a.ts', 'R100\tsrc/old.ts\tsrc/new.ts'].join('\n'),
          stderr: '',
        }) // name-status
        .mockResolvedValueOnce({
          stdout: ['3\t1\tsrc/a.ts', '0\t0\tsrc/{old.ts => new.ts}'].join('\n'),
          stderr: '',
        }); // numstat

      const res = await service.showCommit('/repo', 'a'.repeat(40));

      const a = res.files.find(f => f.path === 'src/a.ts');
      expect(a).toMatchObject({ status: 'modified', additions: 3, deletions: 1 });
      const renamed = res.files.find(f => f.path === 'src/new.ts');
      expect(renamed).toMatchObject({ status: 'renamed', oldPath: 'src/old.ts' });
    });

    it('rejects an invalid sha', async () => {
      await expect(service.showCommit('/repo', '-x')).rejects.toBeInstanceOf(ScmError);
    });
  });

  describe('commitFileDiff', () => {
    it('reuses the GitDiffService parser on git show output', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'RAW DIFF', stderr: '' });
      const fakeFile = { path: 'a.ts', isBinary: false, hunks: [], additions: 0, deletions: 0 };
      gitDiff.parseUnifiedDiff.mockReturnValue([fakeFile]);

      const res = await service.commitFileDiff('/repo', 'a'.repeat(40), 'a.ts');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'show',
        '--no-color',
        '--format=',
        '-M',
        'a'.repeat(40),
        '--',
        'a.ts',
      ]);
      expect(gitDiff.parseUnifiedDiff).toHaveBeenCalledWith('RAW DIFF');
      expect(res.file).toBe(fakeFile);
    });
  });

  describe('fileDiff', () => {
    it('diffs the worktree by default', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'RAW', stderr: '' });
      gitDiff.parseUnifiedDiff.mockReturnValue([]);

      await service.fileDiff('/repo', 'a.ts');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'diff',
        '--no-color',
        '--unified=3',
        '--',
        'a.ts',
      ]);
    });

    it('adds --cached when staged is true', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'RAW', stderr: '' });
      gitDiff.parseUnifiedDiff.mockReturnValue([]);

      await service.fileDiff('/repo', 'a.ts', { staged: true });

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'diff',
        '--no-color',
        '--unified=3',
        '--cached',
        '--',
        'a.ts',
      ]);
    });

    it('rejects an escaping path', async () => {
      await expect(service.fileDiff('/repo', '/etc/passwd')).rejects.toBeInstanceOf(ScmError);
    });
  });
});
