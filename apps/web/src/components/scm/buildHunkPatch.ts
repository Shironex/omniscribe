import type { GitDiffHunk, GitDiffLine, GitFileDiff } from '@omniscribe/shared';

/**
 * Options controlling how a hunk patch is reconstructed.
 */
export interface BuildHunkPatchOptions {
  /**
   * The file is newly added (status 'A' / untracked being staged): emit a
   * `--- /dev/null` old side and a `new file mode` header so `git apply
   * --cached` creates the blob.
   */
  isNewFile?: boolean;
  /**
   * The file is being deleted entirely: emit a `+++ /dev/null` new side and a
   * `deleted file mode` header.
   */
  isDeletedFile?: boolean;
  /**
   * Mark the old and/or new side as missing a trailing newline. When true the
   * `\ No newline at end of file` marker is appended after the relevant final
   * line. Omniscribe's diff parser strips this marker, so the caller must
   * supply it explicitly when known (e.g. from a raw diff string).
   */
  noNewlineOld?: boolean;
  noNewlineNew?: boolean;
}

/** The git "no newline at end of file" sentinel line. */
const NO_NEWLINE_MARKER = '\\ No newline at end of file';

/**
 * Reconstruct a minimal, self-contained unified-diff patch string for a SINGLE
 * hunk of a {@link GitFileDiff}. The result is the exact text the SCM backend
 * pipes to `git apply --cached [--reverse] --unidiff-zero -`:
 *
 *   diff --git a/<path> b/<path>
 *   --- a/<path>
 *   +++ b/<path>
 *   @@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@
 *   <body lines, ' '/'+'/'-' prefixed>
 *
 * The `@@` line-counts are recomputed from the hunk body (context+deletions for
 * the old count, context+additions for the new count) rather than trusting the
 * parsed hunk's `oldLines`/`newLines`, so the patch stays internally consistent
 * even if those were rounded by an upstream parser.
 *
 * Direction is forward only — i.e. it always describes turning the OLD side
 * into the NEW side. Unstaging reuses the same patch; the backend supplies
 * `--reverse`.
 *
 * @param file  The file the hunk belongs to (supplies the path + rename info).
 * @param hunk  The single hunk to stage/unstage.
 * @param options  New-file / deleted-file / no-newline adjustments.
 * @returns A complete unified-diff patch string, newline-terminated.
 */
export function buildHunkPatch(
  file: Pick<GitFileDiff, 'path' | 'oldPath'>,
  hunk: GitDiffHunk,
  options: BuildHunkPatchOptions = {}
): string {
  const { isNewFile = false, isDeletedFile = false, noNewlineOld, noNewlineNew } = options;

  const newPath = file.path;
  // For renames the old side carries the original path; otherwise both sides
  // reference the same path. New/deleted files anchor the present side only.
  const oldPath = file.oldPath ?? file.path;

  const aPath = isNewFile ? '/dev/null' : `a/${quoteIfNeeded(oldPath)}`;
  const bPath = isDeletedFile ? '/dev/null' : `b/${quoteIfNeeded(newPath)}`;

  // git's `diff --git` header always uses the b-path for both sides on the
  // header line, but for new/deleted files it still names the real path. We
  // mirror git: header references the concrete paths (never /dev/null).
  const headerOld = quoteIfNeeded(oldPath);
  const headerNew = quoteIfNeeded(newPath);

  const { oldCount, newCount } = countHunk(hunk.lines);

  // git omits a 0-length side's start line offset semantics, but `git apply`
  // accepts the explicit `start,count` form for all cases; we always emit it.
  const hunkHeader = `@@ -${formatRange(hunk.oldStart, oldCount)} +${formatRange(
    hunk.newStart,
    newCount
  )} @@`;

  const lines: string[] = [];
  lines.push(`diff --git a/${headerOld} b/${headerNew}`);
  if (isNewFile) {
    lines.push('new file mode 100644');
  } else if (isDeletedFile) {
    lines.push('deleted file mode 100644');
  }
  lines.push(`--- ${aPath}`);
  lines.push(`+++ ${bPath}`);
  lines.push(hunkHeader);

  const body = renderBody(hunk.lines, { noNewlineOld, noNewlineNew });
  lines.push(...body);

  // Always newline-terminated — `git apply` rejects a patch whose final line
  // lacks a trailing newline ("corrupt patch at line N").
  return `${lines.join('\n')}\n`;
}

/**
 * Count the old/new line spans of a hunk body. Context lines count toward both
 * sides; deletions count only toward the old side; additions only toward the
 * new side.
 */
function countHunk(diffLines: GitDiffLine[]): { oldCount: number; newCount: number } {
  let oldCount = 0;
  let newCount = 0;
  for (const line of diffLines) {
    if (line.type === 'context') {
      oldCount++;
      newCount++;
    } else if (line.type === 'deletion') {
      oldCount++;
    } else {
      newCount++;
    }
  }
  return { oldCount, newCount };
}

/**
 * Render the `@@` range token. A zero-count side is emitted as
 * `<start>,0` (git's form for a pure insertion/deletion boundary). A
 * single-line side keeps the explicit `,1` for clarity and apply-stability.
 */
function formatRange(start: number, count: number): string {
  if (count === 0) {
    // A zero-length range anchors at `start` (the line BEFORE which content is
    // inserted, or AFTER which content was removed). git uses the start value
    // verbatim with a ,0 count.
    return `${start},0`;
  }
  return `${start},${count}`;
}

/**
 * Render the prefixed body lines for the hunk, inserting the
 * "\ No newline at end of file" marker after the final old/new line when the
 * caller indicates the respective side lacks a trailing newline.
 */
function renderBody(
  diffLines: GitDiffLine[],
  opts: { noNewlineOld?: boolean; noNewlineNew?: boolean }
): string[] {
  const out: string[] = [];

  // Resolve the index of the last line that belongs to each side so the marker
  // lands in git's canonical position (immediately after that line).
  const lastOldIdx = lastIndexOfSide(diffLines, side => side !== 'addition');
  const lastNewIdx = lastIndexOfSide(diffLines, side => side !== 'deletion');

  for (let i = 0; i < diffLines.length; i++) {
    const line = diffLines[i];
    const prefix = line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' ';
    out.push(`${prefix}${line.content}`);

    // A context line that closes BOTH sides only emits one marker (git prints
    // it once for a trailing context line missing a newline on both sides).
    const closesOld = opts.noNewlineOld && i === lastOldIdx;
    const closesNew = opts.noNewlineNew && i === lastNewIdx;
    if (closesOld || closesNew) {
      out.push(NO_NEWLINE_MARKER);
    }
  }

  return out;
}

/**
 * Find the index of the last line participating in a given side. The predicate
 * receives the line type; `true` means "this line belongs to the side".
 */
function lastIndexOfSide(
  diffLines: GitDiffLine[],
  belongs: (type: GitDiffLine['type']) => boolean
): number {
  for (let i = diffLines.length - 1; i >= 0; i--) {
    if (belongs(diffLines[i].type)) return i;
  }
  return -1;
}

/**
 * Quote a path the way git does in diff headers when it contains a space or
 * other shell-significant character. git wraps such paths in double quotes;
 * the backend's patch validator understands the quoted form.
 */
function quoteIfNeeded(p: string): string {
  if (/[\s"\\]/.test(p)) {
    const escaped = p.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return p;
}
