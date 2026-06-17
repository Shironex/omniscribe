import type { GitDiffHunk } from '@omniscribe/shared';

/**
 * Reconstruct the OLD-side and NEW-side text for a single hunk from its parsed
 * lines. Context + deletion lines form the old text; context + addition lines
 * form the new text. Used to feed `@codemirror/merge`'s unified view (original
 * = old, doc = new) so the merge algorithm re-derives the intra-line diff for
 * display.
 */
export function hunkSides(hunk: GitDiffHunk): { oldText: string; newText: string } {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  for (const line of hunk.lines) {
    if (line.type === 'context') {
      oldLines.push(line.content);
      newLines.push(line.content);
    } else if (line.type === 'deletion') {
      oldLines.push(line.content);
    } else {
      newLines.push(line.content);
    }
  }
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') };
}

/**
 * The first old/new line numbers shown for a hunk, for the gutter caption.
 */
export function hunkLineRange(hunk: GitDiffHunk): {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
} {
  let oldLines = 0;
  let newLines = 0;
  for (const line of hunk.lines) {
    if (line.type === 'context') {
      oldLines++;
      newLines++;
    } else if (line.type === 'deletion') {
      oldLines++;
    } else {
      newLines++;
    }
  }
  return { oldStart: hunk.oldStart, oldLines, newStart: hunk.newStart, newLines };
}
