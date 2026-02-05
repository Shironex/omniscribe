import { Test, TestingModule } from '@nestjs/testing';
import { GitCommitService } from './git-commit.service';
import { GitBaseService } from './git-base.service';

describe('GitCommitService', () => {
  let service: GitCommitService;
  let gitBase: jest.Mocked<GitBaseService>;

  beforeEach(async () => {
    gitBase = {
      execGit: jest.fn(),
    } as unknown as jest.Mocked<GitBaseService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [GitCommitService, { provide: GitBaseService, useValue: gitBase }],
    }).compile();

    service = module.get<GitCommitService>(GitCommitService);
  });

  describe('getCommitLog', () => {
    const nullByte = '\x00';

    function makeCommitLine(overrides: Partial<Record<string, string>> = {}): string {
      const defaults = {
        hash: 'abc123def456abc123def456abc123def456abc1',
        shortHash: 'abc123d',
        subject: 'feat: add feature',
        body: '',
        authorName: 'John Doe',
        authorEmail: 'john@example.com',
        authorDate: '2024-01-15T10:30:00+00:00',
        committerName: 'John Doe',
        committerEmail: 'john@example.com',
        commitDate: '2024-01-15T10:30:00+00:00',
        parents: 'def456abc123def456abc123def456abc123def4',
        refs: 'HEAD -> main, origin/main',
      };
      const vals = { ...defaults, ...overrides };
      return [
        vals.hash,
        vals.shortHash,
        vals.subject,
        vals.body,
        vals.authorName,
        vals.authorEmail,
        vals.authorDate,
        vals.committerName,
        vals.committerEmail,
        vals.commitDate,
        vals.parents,
        vals.refs,
      ].join(nullByte);
    }

    it('should parse a single commit from the log', async () => {
      const line = makeCommitLine();
      gitBase.execGit.mockResolvedValue({ stdout: line + '\n', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe('abc123def456abc123def456abc123def456abc1');
      expect(result[0].shortHash).toBe('abc123d');
      expect(result[0].subject).toBe('feat: add feature');
      expect(result[0].body).toBeUndefined();
      expect(result[0].authorName).toBe('John Doe');
      expect(result[0].authorEmail).toBe('john@example.com');
      expect(result[0].authorDate).toBeInstanceOf(Date);
      expect(result[0].committerName).toBe('John Doe');
      expect(result[0].committerEmail).toBe('john@example.com');
      expect(result[0].commitDate).toBeInstanceOf(Date);
      expect(result[0].parents).toEqual(['def456abc123def456abc123def456abc123def4']);
      expect(result[0].refs).toEqual(['HEAD -> main', 'origin/main']);
    });

    it('should parse multiple commits', async () => {
      const line1 = makeCommitLine({ shortHash: 'aaa1111', subject: 'first commit' });
      const line2 = makeCommitLine({ shortHash: 'bbb2222', subject: 'second commit' });
      gitBase.execGit.mockResolvedValue({
        stdout: line1 + '\n' + line2 + '\n',
        stderr: '',
      });

      const result = await service.getCommitLog('/repo');

      expect(result).toHaveLength(2);
      expect(result[0].shortHash).toBe('aaa1111');
      expect(result[1].shortHash).toBe('bbb2222');
    });

    it('should handle commits with body text', async () => {
      const line = makeCommitLine({ body: 'Detailed description of changes' });
      gitBase.execGit.mockResolvedValue({ stdout: line + '\n', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result[0].body).toBe('Detailed description of changes');
    });

    it('should handle commits with no parents (root commit)', async () => {
      const line = makeCommitLine({ parents: '' });
      gitBase.execGit.mockResolvedValue({ stdout: line + '\n', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result[0].parents).toEqual([]);
    });

    it('should handle merge commits with multiple parents', async () => {
      const line = makeCommitLine({
        parents: 'abc123 def456 ghi789',
      });
      gitBase.execGit.mockResolvedValue({ stdout: line + '\n', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result[0].parents).toEqual(['abc123', 'def456', 'ghi789']);
    });

    it('should handle commits with no refs', async () => {
      const line = makeCommitLine({ refs: '' });
      gitBase.execGit.mockResolvedValue({ stdout: line + '\n', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result[0].refs).toBeUndefined();
    });

    it('should return empty array for empty output', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result).toEqual([]);
    });

    it('should skip lines with fewer than 12 parts', async () => {
      const badLine = 'abc123' + nullByte + 'short';
      const goodLine = makeCommitLine();
      gitBase.execGit.mockResolvedValue({
        stdout: badLine + '\n' + goodLine + '\n',
        stderr: '',
      });

      const result = await service.getCommitLog('/repo');

      expect(result).toHaveLength(1);
    });

    it('should pass correct args with default parameters', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.getCommitLog('/repo');

      const call = gitBase.execGit.mock.calls[0];
      expect(call[0]).toBe('/repo');
      const args = call[1] as string[];
      expect(args[0]).toBe('log');
      expect(args).toContainEqual(expect.stringContaining('-n50'));
      expect(args).toContain('--all');
      expect(args).toContain('--date=iso-strict');
    });

    it('should pass custom limit', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.getCommitLog('/repo', 10);

      const args = gitBase.execGit.mock.calls[0][1] as string[];
      expect(args).toContainEqual(expect.stringContaining('-n10'));
    });

    it('should not include --all when allBranches is false', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.getCommitLog('/repo', 50, false);

      const args = gitBase.execGit.mock.calls[0][1] as string[];
      expect(args).not.toContain('--all');
    });

    it('should handle Windows-quoted output', async () => {
      const line = '"' + makeCommitLine() + '"';
      gitBase.execGit.mockResolvedValue({ stdout: line + '\n', stderr: '' });

      const result = await service.getCommitLog('/repo');

      expect(result).toHaveLength(1);
      expect(result[0].hash).toBe('abc123def456abc123def456abc123def456abc1');
    });
  });

  describe('stage', () => {
    it('should stage the specified files', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.stage('/repo', ['file1.ts', 'file2.ts']);

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['add', '--', 'file1.ts', 'file2.ts']);
    });

    it('should do nothing when files array is empty', async () => {
      await service.stage('/repo', []);

      expect(gitBase.execGit).not.toHaveBeenCalled();
    });

    it('should stage a single file', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.stage('/repo', ['README.md']);

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['add', '--', 'README.md']);
    });
  });

  describe('unstage', () => {
    it('should unstage the specified files', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      await service.unstage('/repo', ['file1.ts', 'file2.ts']);

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'restore',
        '--staged',
        '--',
        'file1.ts',
        'file2.ts',
      ]);
    });

    it('should do nothing when files array is empty', async () => {
      await service.unstage('/repo', []);

      expect(gitBase.execGit).not.toHaveBeenCalled();
    });
  });

  describe('commit', () => {
    it('should create a commit and return the hash', async () => {
      gitBase.execGit
        .mockResolvedValueOnce({ stdout: '', stderr: '' }) // commit
        .mockResolvedValueOnce({ stdout: 'abc123def456\n', stderr: '' }); // rev-parse HEAD

      const result = await service.commit('/repo', 'feat: add feature');

      expect(result).toBe('abc123def456');
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['commit', '-m', 'feat: add feature']);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['rev-parse', 'HEAD']);
    });

    it('should propagate errors from the commit command', async () => {
      gitBase.execGit.mockRejectedValue(new Error('nothing to commit'));

      await expect(service.commit('/repo', 'empty')).rejects.toThrow('nothing to commit');
    });
  });

  describe('diff', () => {
    it('should return diff output for the working tree', async () => {
      const diffOutput = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line1
+new line
 line2
 line3`;
      gitBase.execGit.mockResolvedValue({ stdout: diffOutput, stderr: '' });

      const result = await service.diff('/repo');

      expect(result).toBe(diffOutput);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['diff']);
    });

    it('should return diff for a specific file', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: 'file diff output', stderr: '' });

      const result = await service.diff('/repo', 'src/app.ts');

      expect(result).toBe('file diff output');
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', ['diff', '--', 'src/app.ts']);
    });

    it('should return empty string when there are no changes', async () => {
      gitBase.execGit.mockResolvedValue({ stdout: '', stderr: '' });

      const result = await service.diff('/repo');

      expect(result).toBe('');
    });
  });
});
