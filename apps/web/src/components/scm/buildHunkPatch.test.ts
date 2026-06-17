import { describe, it, expect } from 'vitest';
import type { GitDiffHunk, GitDiffLine } from '@omniscribe/shared';
import { buildHunkPatch } from './buildHunkPatch';

/** Terse helpers for assembling hunk lines. */
const ctx = (content: string, o: number, n: number): GitDiffLine => ({
  type: 'context',
  content,
  oldLineNumber: o,
  newLineNumber: n,
});
const add = (content: string, n: number): GitDiffLine => ({
  type: 'addition',
  content,
  newLineNumber: n,
});
const del = (content: string, o: number): GitDiffLine => ({
  type: 'deletion',
  content,
  oldLineNumber: o,
});

/** Extract only the hunk body lines (drop the diff/file/@@ headers). */
function bodyLines(patch: string): string[] {
  const all = patch.split('\n');
  const at = all.findIndex(l => l.startsWith('@@'));
  return all.slice(at + 1).filter(l => l.length > 0);
}

function hunk(
  partial: Partial<GitDiffHunk> & Pick<GitDiffHunk, 'oldStart' | 'newStart' | 'lines'>
): GitDiffHunk {
  const { oldStart, newStart, lines } = partial;
  return {
    oldStart,
    newStart,
    oldLines: partial.oldLines ?? lines.filter(l => l.type !== 'addition').length,
    newLines: partial.newLines ?? lines.filter(l => l.type !== 'deletion').length,
    header: partial.header ?? '',
    lines,
    oldNoNewlineAtEof: partial.oldNoNewlineAtEof,
    newNoNewlineAtEof: partial.newNoNewlineAtEof,
  };
}

describe('buildHunkPatch', () => {
  it('reconstructs a modification hunk with context preserved', () => {
    const patch = buildHunkPatch(
      { path: 'src/app.ts' },
      hunk({
        oldStart: 10,
        newStart: 10,
        lines: [
          ctx('  const a = 1;', 10, 10),
          del('  const b = 2;', 11),
          add('  const b = 3;', 11),
          ctx('  return a + b;', 12, 12),
        ],
      })
    );

    expect(patch).toBe(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -10,3 +10,3 @@',
        '   const a = 1;',
        '-  const b = 2;',
        '+  const b = 3;',
        '   return a + b;',
        '',
      ].join('\n')
    );
  });

  it('computes counts from the body, not the parsed oldLines/newLines', () => {
    // Pass deliberately wrong oldLines/newLines; the patch header must ignore them.
    const patch = buildHunkPatch(
      { path: 'a.txt' },
      hunk({
        oldStart: 1,
        newStart: 1,
        oldLines: 999,
        newLines: 999,
        lines: [add('only an addition', 1)],
      })
    );
    expect(patch).toContain('@@ -1,0 +1,1 @@');
  });

  it('always terminates the patch with a trailing newline', () => {
    const patch = buildHunkPatch(
      { path: 'a.txt' },
      hunk({ oldStart: 1, newStart: 1, lines: [add('x', 1)] })
    );
    expect(patch.endsWith('\n')).toBe(true);
    expect(patch.endsWith('\n\n')).toBe(false);
  });

  it('handles a pure-addition hunk (insert into existing file)', () => {
    const patch = buildHunkPatch(
      { path: 'list.txt' },
      hunk({
        oldStart: 3,
        newStart: 4,
        lines: [add('inserted line', 4)],
      })
    );
    const body = bodyLines(patch);
    expect(patch.split('\n')).toContain('@@ -3,0 +4,1 @@');
    expect(body).toContain('+inserted line');
    // No old-side body lines.
    expect(body.some(l => l.startsWith('-'))).toBe(false);
  });

  it('handles a pure-deletion hunk', () => {
    const patch = buildHunkPatch(
      { path: 'list.txt' },
      hunk({
        oldStart: 5,
        newStart: 4,
        lines: [del('removed line', 5)],
      })
    );
    const body = bodyLines(patch);
    expect(patch.split('\n')).toContain('@@ -5,1 +4,0 @@');
    expect(body).toContain('-removed line');
    expect(body.some(l => l.startsWith('+'))).toBe(false);
  });

  it('emits new-file headers when staging an added file', () => {
    const patch = buildHunkPatch(
      { path: 'newfile.ts' },
      hunk({
        oldStart: 0,
        newStart: 1,
        lines: [add('line one', 1), add('line two', 2)],
      }),
      { isNewFile: true }
    );
    const lines = patch.split('\n');
    expect(lines[0]).toBe('diff --git a/newfile.ts b/newfile.ts');
    expect(lines).toContain('new file mode 100644');
    expect(lines).toContain('--- /dev/null');
    expect(lines).toContain('+++ b/newfile.ts');
    expect(lines).toContain('@@ -0,0 +1,2 @@');
  });

  it('emits deleted-file headers when staging a deletion', () => {
    const patch = buildHunkPatch(
      { path: 'gone.ts' },
      hunk({
        oldStart: 1,
        newStart: 0,
        lines: [del('was here', 1)],
      }),
      { isDeletedFile: true }
    );
    const lines = patch.split('\n');
    expect(lines).toContain('deleted file mode 100644');
    expect(lines).toContain('--- a/gone.ts');
    expect(lines).toContain('+++ /dev/null');
    expect(lines).toContain('@@ -1,1 +0,0 @@');
  });

  it('uses the rename old path on the old side', () => {
    const patch = buildHunkPatch(
      { path: 'new/name.ts', oldPath: 'old/name.ts' },
      hunk({
        oldStart: 1,
        newStart: 1,
        lines: [del('a', 1), add('b', 1)],
      })
    );
    const lines = patch.split('\n');
    expect(lines[0]).toBe('diff --git a/old/name.ts b/new/name.ts');
    expect(lines).toContain('--- a/old/name.ts');
    expect(lines).toContain('+++ b/new/name.ts');
  });

  it('appends the no-newline-at-eof marker after the final new-side line', () => {
    const patch = buildHunkPatch(
      { path: 'a.txt' },
      hunk({
        oldStart: 1,
        newStart: 1,
        lines: [del('old', 1), add('new without newline', 1)],
      }),
      { noNewlineNew: true }
    );
    const lines = patch.split('\n');
    const addIdx = lines.indexOf('+new without newline');
    expect(addIdx).toBeGreaterThan(-1);
    expect(lines[addIdx + 1]).toBe('\\ No newline at end of file');
  });

  it('appends the no-newline marker after the final old-side line for a deletion', () => {
    const patch = buildHunkPatch(
      { path: 'a.txt' },
      hunk({
        oldStart: 1,
        newStart: 1,
        lines: [del('old without newline', 1), add('new', 1)],
      }),
      { noNewlineOld: true }
    );
    const lines = patch.split('\n');
    const delIdx = lines.indexOf('-old without newline');
    expect(lines[delIdx + 1]).toBe('\\ No newline at end of file');
  });

  it('emits a single marker for a trailing context line missing newline on both sides', () => {
    const patch = buildHunkPatch(
      { path: 'a.txt' },
      hunk({
        oldStart: 1,
        newStart: 1,
        lines: [add('added', 1), ctx('trailing ctx', 2, 2)],
      }),
      { noNewlineOld: true, noNewlineNew: true }
    );
    const markerCount = patch.split('\n').filter(l => l === '\\ No newline at end of file').length;
    expect(markerCount).toBe(1);
  });

  it('quotes paths containing spaces', () => {
    const patch = buildHunkPatch(
      { path: 'dir/file with space.ts' },
      hunk({ oldStart: 1, newStart: 1, lines: [add('x', 1)] })
    );
    const lines = patch.split('\n');
    expect(lines[0]).toBe('diff --git a/"dir/file with space.ts" b/"dir/file with space.ts"');
    expect(lines).toContain('+++ b/"dir/file with space.ts"');
  });

  it('preserves empty-string content lines (blank line edits)', () => {
    const patch = buildHunkPatch(
      { path: 'a.txt' },
      hunk({
        oldStart: 1,
        newStart: 1,
        lines: [ctx('first', 1, 1), add('', 2), ctx('second', 2, 3)],
      })
    );
    const lines = patch.split('\n');
    // The blank addition becomes a bare '+' line.
    expect(lines).toContain('+');
    expect(lines).toContain('@@ -1,2 +1,3 @@');
  });

  describe('no-newline flags carried on the hunk (parser-populated path)', () => {
    const MARKER = '\\ No newline at end of file';

    it('emits the marker after the new side from hunk.newNoNewlineAtEof', () => {
      const patch = buildHunkPatch(
        { path: 'a.txt' },
        hunk({
          oldStart: 1,
          newStart: 1,
          lines: [del('old', 1), add('new no newline', 1)],
          newNoNewlineAtEof: true,
        })
      );
      const lines = patch.split('\n');
      const addIdx = lines.indexOf('+new no newline');
      expect(lines[addIdx + 1]).toBe(MARKER);
      // Old side keeps its newline → no marker after the deletion.
      const delIdx = lines.indexOf('-old');
      expect(lines[delIdx + 1]).not.toBe(MARKER);
    });

    it('emits the marker after the old side from hunk.oldNoNewlineAtEof', () => {
      const patch = buildHunkPatch(
        { path: 'a.txt' },
        hunk({
          oldStart: 1,
          newStart: 1,
          lines: [del('old no newline', 1), add('new', 1)],
          oldNoNewlineAtEof: true,
        })
      );
      const lines = patch.split('\n');
      const delIdx = lines.indexOf('-old no newline');
      expect(lines[delIdx + 1]).toBe(MARKER);
    });

    it('emits a single marker for a trailing context line flagged on both sides', () => {
      const patch = buildHunkPatch(
        { path: 'a.txt' },
        hunk({
          oldStart: 1,
          newStart: 1,
          lines: [add('added', 1), ctx('trailing ctx', 2, 2)],
          oldNoNewlineAtEof: true,
          newNoNewlineAtEof: true,
        })
      );
      const markerCount = patch.split('\n').filter(l => l === MARKER).length;
      expect(markerCount).toBe(1);
      // And it lands right after the trailing context line.
      const lines = patch.split('\n');
      const ctxIdx = lines.indexOf(' trailing ctx');
      expect(lines[ctxIdx + 1]).toBe(MARKER);
    });

    it('emits no marker when neither flag is set', () => {
      const patch = buildHunkPatch(
        { path: 'a.txt' },
        hunk({ oldStart: 1, newStart: 1, lines: [del('old', 1), add('new', 1)] })
      );
      expect(patch).not.toContain(MARKER);
    });

    it('lets an explicit option override the hunk flag (force on)', () => {
      const patch = buildHunkPatch(
        { path: 'a.txt' },
        hunk({
          oldStart: 1,
          newStart: 1,
          lines: [del('old', 1), add('new', 1)],
          // Hunk says new side keeps its newline...
          newNoNewlineAtEof: false,
        }),
        // ...but the caller forces the marker on.
        { noNewlineNew: true }
      );
      const lines = patch.split('\n');
      const addIdx = lines.indexOf('+new');
      expect(lines[addIdx + 1]).toBe(MARKER);
    });

    it('round-trips parser flags into a both-sides single-line edit', () => {
      // Mirrors `git diff` of editing the sole, newline-less line of a file:
      // marker appears after BOTH the deletion and the addition in real git
      // output, which the parser collapses to two flags → buildHunkPatch
      // re-emits the marker after each side's final line.
      const patch = buildHunkPatch(
        { path: 'c.txt' },
        hunk({
          oldStart: 1,
          newStart: 1,
          lines: [del('before', 1), add('after', 1)],
          oldNoNewlineAtEof: true,
          newNoNewlineAtEof: true,
        })
      );
      expect(patch).toBe(
        [
          'diff --git a/c.txt b/c.txt',
          '--- a/c.txt',
          '+++ b/c.txt',
          '@@ -1,1 +1,1 @@',
          '-before',
          MARKER,
          '+after',
          MARKER,
          '',
        ].join('\n')
      );
    });
  });
});
