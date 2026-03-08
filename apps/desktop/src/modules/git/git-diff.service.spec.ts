import { Test, TestingModule } from '@nestjs/testing';
import { GitDiffService } from './git-diff.service';
import { GitBaseService } from './git-base.service';
import { GitStatusService } from './git-status.service';

describe('GitDiffService', () => {
  let service: GitDiffService;
  let gitBase: jest.Mocked<GitBaseService>;
  let gitStatus: jest.Mocked<GitStatusService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GitDiffService,
        {
          provide: GitBaseService,
          useValue: {
            execGit: jest.fn(),
          },
        },
        {
          provide: GitStatusService,
          useValue: {
            getStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GitDiffService>(GitDiffService);
    gitBase = module.get(GitBaseService) as jest.Mocked<GitBaseService>;
    gitStatus = module.get(GitStatusService) as jest.Mocked<GitStatusService>;
  });

  // =========================================================================
  // parseUnifiedDiff()
  // =========================================================================
  describe('parseUnifiedDiff', () => {
    it('should return empty array for empty string', () => {
      expect(service.parseUnifiedDiff('')).toEqual([]);
    });

    it('should return empty array for whitespace-only string', () => {
      expect(service.parseUnifiedDiff('   \n\n  ')).toEqual([]);
    });

    it('should parse a single-file diff with one hunk', () => {
      const rawDiff = [
        'diff --git a/src/index.ts b/src/index.ts',
        'index abc1234..def5678 100644',
        '--- a/src/index.ts',
        '+++ b/src/index.ts',
        '@@ -1,3 +1,4 @@',
        ' line1',
        ' line2',
        '+new line',
        ' line3',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('src/index.ts');
      expect(result[0].oldPath).toBeUndefined();
      expect(result[0].isBinary).toBe(false);
      expect(result[0].additions).toBe(1);
      expect(result[0].deletions).toBe(0);
      expect(result[0].hunks).toHaveLength(1);

      const hunk = result[0].hunks[0];
      expect(hunk.oldStart).toBe(1);
      expect(hunk.oldLines).toBe(3);
      expect(hunk.newStart).toBe(1);
      expect(hunk.newLines).toBe(4);
      expect(hunk.lines).toHaveLength(4);

      // Verify line types and content
      expect(hunk.lines[0]).toEqual({
        type: 'context',
        content: 'line1',
        oldLineNumber: 1,
        newLineNumber: 1,
      });
      expect(hunk.lines[1]).toEqual({
        type: 'context',
        content: 'line2',
        oldLineNumber: 2,
        newLineNumber: 2,
      });
      expect(hunk.lines[2]).toEqual({
        type: 'addition',
        content: 'new line',
        newLineNumber: 3,
      });
      expect(hunk.lines[3]).toEqual({
        type: 'context',
        content: 'line3',
        oldLineNumber: 3,
        newLineNumber: 4,
      });
    });

    it('should parse a multi-file diff', () => {
      const rawDiff = [
        'diff --git a/file1.ts b/file1.ts',
        'index abc..def 100644',
        '--- a/file1.ts',
        '+++ b/file1.ts',
        '@@ -1,2 +1,3 @@',
        ' old',
        '+added',
        ' end',
        'diff --git a/file2.ts b/file2.ts',
        'index 111..222 100644',
        '--- a/file2.ts',
        '+++ b/file2.ts',
        '@@ -5,3 +5,2 @@',
        ' keep',
        '-removed',
        ' end',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('file1.ts');
      expect(result[0].additions).toBe(1);
      expect(result[0].deletions).toBe(0);
      expect(result[1].path).toBe('file2.ts');
      expect(result[1].additions).toBe(0);
      expect(result[1].deletions).toBe(1);
    });

    it('should detect renamed files', () => {
      const rawDiff = [
        'diff --git a/old-name.ts b/new-name.ts',
        'similarity index 95%',
        'rename from old-name.ts',
        'rename to new-name.ts',
        'index abc..def 100644',
        '--- a/old-name.ts',
        '+++ b/new-name.ts',
        '@@ -1,3 +1,3 @@',
        ' unchanged',
        '-old line',
        '+new line',
        ' end',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('new-name.ts');
      expect(result[0].oldPath).toBe('old-name.ts');
      expect(result[0].additions).toBe(1);
      expect(result[0].deletions).toBe(1);
    });

    it('should handle binary files with "Binary files" marker', () => {
      const rawDiff = [
        'diff --git a/image.png b/image.png',
        'index abc..def 100644',
        'Binary files a/image.png and b/image.png differ',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('image.png');
      expect(result[0].isBinary).toBe(true);
      expect(result[0].hunks).toHaveLength(0);
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(0);
    });

    it('should handle binary files with "GIT binary patch" marker', () => {
      const rawDiff = [
        'diff --git a/data.bin b/data.bin',
        'index abc..def 100644',
        'GIT binary patch',
        'literal 1234',
        'some encoded data',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('data.bin');
      expect(result[0].isBinary).toBe(true);
      expect(result[0].hunks).toHaveLength(0);
    });

    it('should parse a file with multiple hunks', () => {
      const rawDiff = [
        'diff --git a/large.ts b/large.ts',
        'index abc..def 100644',
        '--- a/large.ts',
        '+++ b/large.ts',
        '@@ -1,3 +1,4 @@ function first()',
        ' line1',
        '+added1',
        ' line2',
        ' line3',
        '@@ -20,3 +21,2 @@ function second()',
        ' line20',
        '-removed1',
        ' line22',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].hunks).toHaveLength(2);

      const hunk1 = result[0].hunks[0];
      expect(hunk1.oldStart).toBe(1);
      expect(hunk1.newStart).toBe(1);
      expect(hunk1.header).toBe('function first()');
      expect(hunk1.lines).toHaveLength(4);

      const hunk2 = result[0].hunks[1];
      expect(hunk2.oldStart).toBe(20);
      expect(hunk2.newStart).toBe(21);
      expect(hunk2.header).toBe('function second()');
      expect(hunk2.lines).toHaveLength(3);

      expect(result[0].additions).toBe(1);
      expect(result[0].deletions).toBe(1);
    });

    it('should parse hunks with additions only', () => {
      const rawDiff = [
        'diff --git a/new.ts b/new.ts',
        'new file mode 100644',
        'index 0000000..abc1234',
        '--- /dev/null',
        '+++ b/new.ts',
        '@@ -0,0 +1,3 @@',
        '+line1',
        '+line2',
        '+line3',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].additions).toBe(3);
      expect(result[0].deletions).toBe(0);
      expect(result[0].hunks[0].lines.every(l => l.type === 'addition')).toBe(true);
    });

    it('should parse hunks with deletions only', () => {
      const rawDiff = [
        'diff --git a/deleted.ts b/deleted.ts',
        'deleted file mode 100644',
        'index abc1234..0000000',
        '--- a/deleted.ts',
        '+++ /dev/null',
        '@@ -1,3 +0,0 @@',
        '-line1',
        '-line2',
        '-line3',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      expect(result[0].additions).toBe(0);
      expect(result[0].deletions).toBe(3);
      expect(result[0].hunks[0].lines.every(l => l.type === 'deletion')).toBe(true);
    });

    it('should skip "no newline at end of file" markers', () => {
      const rawDiff = [
        'diff --git a/file.ts b/file.ts',
        'index abc..def 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,2 +1,2 @@',
        '-old content',
        '\\ No newline at end of file',
        '+new content',
        '\\ No newline at end of file',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);

      expect(result).toHaveLength(1);
      // Should only have the deletion and addition, not the "no newline" markers
      expect(result[0].hunks[0].lines).toHaveLength(2);
      expect(result[0].hunks[0].lines[0].type).toBe('deletion');
      expect(result[0].hunks[0].lines[1].type).toBe('addition');
    });

    it('should handle mixed additions and deletions with correct line numbering', () => {
      const rawDiff = [
        'diff --git a/mix.ts b/mix.ts',
        'index abc..def 100644',
        '--- a/mix.ts',
        '+++ b/mix.ts',
        '@@ -10,5 +10,5 @@',
        ' context1',
        '-old1',
        '-old2',
        '+new1',
        '+new2',
        ' context2',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);
      const lines = result[0].hunks[0].lines;

      // context1: old=10, new=10
      expect(lines[0]).toEqual({
        type: 'context',
        content: 'context1',
        oldLineNumber: 10,
        newLineNumber: 10,
      });
      // -old1: old=11
      expect(lines[1]).toEqual({
        type: 'deletion',
        content: 'old1',
        oldLineNumber: 11,
      });
      // -old2: old=12
      expect(lines[2]).toEqual({
        type: 'deletion',
        content: 'old2',
        oldLineNumber: 12,
      });
      // +new1: new=11
      expect(lines[3]).toEqual({
        type: 'addition',
        content: 'new1',
        newLineNumber: 11,
      });
      // +new2: new=12
      expect(lines[4]).toEqual({
        type: 'addition',
        content: 'new2',
        newLineNumber: 12,
      });
      // context2: old=13, new=13
      expect(lines[5]).toEqual({
        type: 'context',
        content: 'context2',
        oldLineNumber: 13,
        newLineNumber: 13,
      });
    });

    it('should handle hunk header with default line count of 1', () => {
      // When line count is omitted, it defaults to 1 (e.g., @@ -1 +1 @@)
      const rawDiff = [
        'diff --git a/one.ts b/one.ts',
        'index abc..def 100644',
        '--- a/one.ts',
        '+++ b/one.ts',
        '@@ -1 +1 @@',
        '-old',
        '+new',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);
      const hunk = result[0].hunks[0];

      expect(hunk.oldLines).toBe(1);
      expect(hunk.newLines).toBe(1);
    });

    it('should not set oldPath when paths are the same', () => {
      const rawDiff = [
        'diff --git a/same.ts b/same.ts',
        'index abc..def 100644',
        '--- a/same.ts',
        '+++ b/same.ts',
        '@@ -1,1 +1,1 @@',
        '-old',
        '+new',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);
      expect(result[0].oldPath).toBeUndefined();
    });

    it('should skip sections without valid header match', () => {
      const rawDiff = [
        'diff --git some garbage that does not match the regex',
        'more garbage',
      ].join('\n');

      const result = service.parseUnifiedDiff(rawDiff);
      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // getDiff()
  // =========================================================================
  describe('getDiff', () => {
    it('should return parsed diff with totals for tracked changes', async () => {
      const rawDiff = [
        'diff --git a/file.ts b/file.ts',
        'index abc..def 100644',
        '--- a/file.ts',
        '+++ b/file.ts',
        '@@ -1,2 +1,3 @@',
        ' ctx',
        '+added',
        ' end',
      ].join('\n');

      gitBase.execGit.mockResolvedValueOnce({ stdout: rawDiff, stderr: '' });
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      const result = await service.getDiff('/repo');

      expect(result.files).toHaveLength(1);
      expect(result.totalAdditions).toBe(1);
      expect(result.totalDeletions).toBe(0);
      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'diff',
        'HEAD',
        '--no-color',
        '--unified=3',
      ]);
    });

    it('should use provided baseCommit ref', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      await service.getDiff('/repo', 'abc123');

      expect(gitBase.execGit).toHaveBeenCalledWith('/repo', [
        'diff',
        'abc123',
        '--no-color',
        '--unified=3',
      ]);
    });

    it('should fall back to cached diff when ref diff fails', async () => {
      gitBase.execGit
        .mockRejectedValueOnce(new Error('bad ref'))
        .mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      await service.getDiff('/repo');

      // First call fails, second call is the fallback
      expect(gitBase.execGit).toHaveBeenCalledTimes(2);
      expect(gitBase.execGit).toHaveBeenNthCalledWith(2, '/repo', [
        'diff',
        '--cached',
        '--no-color',
        '--unified=3',
      ]);
    });

    it('should return empty files when both diff calls fail', async () => {
      gitBase.execGit
        .mockRejectedValueOnce(new Error('bad ref'))
        .mockRejectedValueOnce(new Error('no index'));
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: true,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      const result = await service.getDiff('/repo');

      expect(result.files).toHaveLength(0);
      expect(result.totalAdditions).toBe(0);
      expect(result.totalDeletions).toBe(0);
    });

    it('should skip untracked files when includeUntracked is false', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const result = await service.getDiff('/repo', undefined, false);

      expect(result.files).toHaveLength(0);
      // getStatus should not be called when includeUntracked=false
      expect(gitStatus.getStatus).not.toHaveBeenCalled();
    });

    it('should generate synthetic diffs for untracked text files', async () => {
      // Main diff returns nothing
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      // getStatus returns untracked files
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: false,
        staged: [],
        unstaged: [],
        untracked: ['newfile.ts'],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      // Synthetic diff for untracked file
      const syntheticDiff = [
        'diff --git a/NUL b/newfile.ts',
        'index 0000000..abc1234',
        '--- a/NUL',
        '+++ b/newfile.ts',
        '@@ -0,0 +1,2 @@',
        '+hello',
        '+world',
      ].join('\n');
      gitBase.execGit.mockResolvedValueOnce({ stdout: syntheticDiff, stderr: '' });

      const result = await service.getDiff('/repo');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('newfile.ts');
      expect(result.files[0].additions).toBe(2);
    });

    it('should create binary marker for untracked binary extension files', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: false,
        staged: [],
        unstaged: [],
        untracked: ['photo.png'],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      const result = await service.getDiff('/repo');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('photo.png');
      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].additions).toBe(0);
      expect(result.files[0].deletions).toBe(0);
      // Should NOT call execGit for synthetic diff of a binary file
      // First call was the main diff; no second call for this binary file
      expect(gitBase.execGit).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple binary extensions correctly', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      const binaryFiles = ['a.jpg', 'b.wasm', 'c.exe', 'd.pdf', 'e.zip'];
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: false,
        staged: [],
        unstaged: [],
        untracked: binaryFiles,
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      const result = await service.getDiff('/repo');

      expect(result.files).toHaveLength(5);
      for (const file of result.files) {
        expect(file.isBinary).toBe(true);
      }
    });

    it('should handle untracked file without extension as non-binary', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });

      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: false,
        staged: [],
        unstaged: [],
        untracked: ['Makefile'],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      // Synthetic diff for the file
      const syntheticDiff = [
        'diff --git a/NUL b/Makefile',
        'index 0000000..abc',
        '--- a/NUL',
        '+++ b/Makefile',
        '@@ -0,0 +1,1 @@',
        '+all: build',
      ].join('\n');
      gitBase.execGit.mockResolvedValueOnce({ stdout: syntheticDiff, stderr: '' });

      const result = await service.getDiff('/repo');

      expect(result.files).toHaveLength(1);
      expect(result.files[0].isBinary).toBeFalsy();
    });

    it('should handle getStatus failure gracefully for untracked files', async () => {
      gitBase.execGit.mockResolvedValueOnce({ stdout: '', stderr: '' });
      gitStatus.getStatus.mockRejectedValueOnce(new Error('git status failed'));

      const result = await service.getDiff('/repo');

      // Should return empty when status fails
      expect(result.files).toHaveLength(0);
    });

    it('should aggregate totalAdditions and totalDeletions across files', async () => {
      const rawDiff = [
        'diff --git a/a.ts b/a.ts',
        'index abc..def 100644',
        '--- a/a.ts',
        '+++ b/a.ts',
        '@@ -1,2 +1,3 @@',
        ' ctx',
        '+add1',
        ' end',
        'diff --git a/b.ts b/b.ts',
        'index abc..def 100644',
        '--- a/b.ts',
        '+++ b/b.ts',
        '@@ -1,3 +1,1 @@',
        ' ctx',
        '-del1',
        '-del2',
      ].join('\n');

      gitBase.execGit.mockResolvedValueOnce({ stdout: rawDiff, stderr: '' });
      gitStatus.getStatus.mockResolvedValueOnce({
        isRepo: true,
        isClean: false,
        staged: [],
        unstaged: [],
        untracked: [],
        hasConflicts: false,
        isRebasing: false,
        isMerging: false,
        stashCount: 0,
      });

      const result = await service.getDiff('/repo');

      expect(result.totalAdditions).toBe(1);
      expect(result.totalDeletions).toBe(2);
    });
  });
});
