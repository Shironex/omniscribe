import { describe, it, expect } from 'vitest';
import type { GitDiffHunk, GitDiffLine } from '@omniscribe/shared';
import { hunkSides, hunkLineRange } from './scmDiffText';

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

function hunk(partial: Partial<GitDiffHunk> & Pick<GitDiffHunk, 'lines'>): GitDiffHunk {
  return {
    oldStart: partial.oldStart ?? 1,
    newStart: partial.newStart ?? 1,
    oldLines: partial.oldLines ?? 0,
    newLines: partial.newLines ?? 0,
    header: partial.header ?? '',
    lines: partial.lines,
    oldNoNewlineAtEof: partial.oldNoNewlineAtEof,
    newNoNewlineAtEof: partial.newNoNewlineAtEof,
  };
}

describe('hunkSides', () => {
  it('reconstructs old text from context + deletion lines', () => {
    const { oldText } = hunkSides(
      hunk({ lines: [ctx('a', 1, 1), del('b', 2), add('c', 2), ctx('d', 3, 3)] })
    );
    expect(oldText).toBe('a\nb\nd');
  });

  it('reconstructs new text from context + addition lines', () => {
    const { newText } = hunkSides(
      hunk({ lines: [ctx('a', 1, 1), del('b', 2), add('c', 2), ctx('d', 3, 3)] })
    );
    expect(newText).toBe('a\nc\nd');
  });

  it('never renders the no-newline marker even when the side flags are set', () => {
    // The parser stamps these flags; the rendered text must show only file
    // content lines, not the `\ No newline at end of file` sentinel.
    const { oldText, newText } = hunkSides(
      hunk({
        lines: [del('before', 1), add('after', 1)],
        oldNoNewlineAtEof: true,
        newNoNewlineAtEof: true,
      })
    );
    expect(oldText).toBe('before');
    expect(newText).toBe('after');
    expect(oldText).not.toContain('No newline');
    expect(newText).not.toContain('No newline');
    expect(oldText).not.toContain('\\');
    expect(newText).not.toContain('\\');
  });
});

describe('hunkLineRange', () => {
  it('counts old/new spans and carries the start lines', () => {
    const range = hunkLineRange(
      hunk({
        oldStart: 10,
        newStart: 12,
        lines: [ctx('a', 10, 12), del('b', 11), add('c', 13), add('d', 14)],
      })
    );
    expect(range).toEqual({ oldStart: 10, oldLines: 2, newStart: 12, newLines: 3 });
  });
});
