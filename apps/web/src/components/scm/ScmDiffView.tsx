import { useMemo } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { unifiedMergeView } from '@codemirror/merge';
import CodeMirror from '@uiw/react-codemirror';
import { Plus, Minus, FileX, Loader2 } from 'lucide-react';
import type { GitDiffHunk, GitFileDiff } from '@omniscribe/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useEditorThemeExtension } from '@/components/editor/editorTheme';
import { hunkSides, hunkLineRange } from './scmDiffText';
import { buildHunkPatch, type BuildHunkPatchOptions } from './buildHunkPatch';
import { languageExtensionForFile } from './languageForFile';

export interface ScmDiffViewProps {
  /** The diff to render, or null while loading / no changes. */
  file: GitFileDiff | null;
  loading?: boolean;
  error?: string | null;
  /**
   * When provided, each hunk renders a "Stage hunk" / "Unstage hunk" button.
   * `staged` controls which label/action shows: a staged diff offers
   * "Unstage hunk", an unstaged diff offers "Stage hunk".
   */
  staged?: boolean;
  /** Called with the reconstructed single-hunk patch when an action fires. */
  onStageHunk?: (patch: string) => void;
  onUnstageHunk?: (patch: string) => void;
  /** Disable hunk buttons while an op is in flight. */
  hunkBusy?: boolean;
}

/**
 * Read-only diff surface for a {@link GitFileDiff}. Each hunk is rendered with
 * a `@codemirror/merge` unified view (original = old text, doc = new text) so
 * the merge algorithm re-derives the intra-line highlighting, and a React
 * header carries per-hunk Stage/Unstage controls that reconstruct a minimal
 * single-hunk patch via {@link buildHunkPatch}.
 */
export function ScmDiffView({
  file,
  loading,
  error,
  staged,
  onStageHunk,
  onUnstageHunk,
  hunkBusy,
}: ScmDiffViewProps) {
  // Token-derived CodeMirror theme shared with the editor panes, so the diff
  // tracks the active app theme (incl. live theme switches).
  const themeExt = useEditorThemeExtension();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading diff…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No changes to show.
      </div>
    );
  }

  if (file.isBinary) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <FileX className="h-6 w-6" />
        Binary file — diff not shown.
      </div>
    );
  }

  if (file.hunks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No textual changes.
      </div>
    );
  }

  const patchOptions: BuildHunkPatchOptions = {
    // A staged "deletion" diff means the file is being removed; an unstaged
    // "addition" of a previously-untracked file is a new file. We can't know
    // the exact mode here, so we leave new/deleted flags off for the common
    // modify case — git apply tolerates a modify patch for add/delete when the
    // counts line up. Callers that know better can pre-stage whole files.
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <DiffHeader file={file} />
      {file.hunks.map((hunk, i) => (
        <HunkBlock
          key={`${hunk.oldStart}-${hunk.newStart}-${i}`}
          file={file}
          hunk={hunk}
          staged={staged}
          patchOptions={patchOptions}
          hunkBusy={hunkBusy}
          themeExt={themeExt}
          onStageHunk={onStageHunk}
          onUnstageHunk={onUnstageHunk}
        />
      ))}
    </div>
  );
}

function DiffHeader({ file }: { file: GitFileDiff }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-3 py-1.5 text-xs">
      <span className="truncate font-mono text-foreground" title={file.path}>
        {file.oldPath && file.oldPath !== file.path ? (
          <span className="text-muted-foreground">
            {file.oldPath} <span aria-hidden>→</span>{' '}
          </span>
        ) : null}
        {file.path}
      </span>
      <span className="ml-auto flex items-center gap-2 font-mono">
        <span className="text-status-success">+{file.additions}</span>
        <span className="text-status-error">−{file.deletions}</span>
      </span>
    </div>
  );
}

interface HunkBlockProps {
  file: GitFileDiff;
  hunk: GitDiffHunk;
  staged?: boolean;
  patchOptions: BuildHunkPatchOptions;
  hunkBusy?: boolean;
  themeExt: Extension;
  onStageHunk?: (patch: string) => void;
  onUnstageHunk?: (patch: string) => void;
}

function HunkBlock({
  file,
  hunk,
  staged,
  patchOptions,
  hunkBusy,
  themeExt,
  onStageHunk,
  onUnstageHunk,
}: HunkBlockProps) {
  const { oldText, newText } = useMemo(() => hunkSides(hunk), [hunk]);
  const range = useMemo(() => hunkLineRange(hunk), [hunk]);

  const extensions = useMemo<Extension[]>(() => {
    const lang = languageExtensionForFile(file.path);
    return [
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.lineWrapping,
      unifiedMergeView({
        original: oldText,
        mergeControls: false,
        gutter: true,
        highlightChanges: true,
        collapseUnchanged: { margin: 3, minSize: 4 },
      }),
      themeExt,
      diffTheme,
      ...(lang ? [lang] : []),
    ];
  }, [oldText, file.path, themeExt]);

  const canStage = !staged && onStageHunk;
  const canUnstage = staged && onUnstageHunk;

  const handleHunkAction = () => {
    const patch = buildHunkPatch(file, hunk, patchOptions);
    if (staged) onUnstageHunk?.(patch);
    else onStageHunk?.(patch);
  };

  return (
    <div className="border-b border-border/60">
      <div className="flex items-center gap-2 bg-muted/30 px-3 py-1 font-mono text-[11px] text-muted-foreground">
        <span>
          @@ -{range.oldStart},{range.oldLines} +{range.newStart},{range.newLines} @@
        </span>
        {(canStage || canUnstage) && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 gap-1 px-1.5 text-[11px]"
            disabled={hunkBusy}
            onClick={handleHunkAction}
          >
            {staged ? (
              <>
                <Minus className="h-3 w-3" /> Unstage hunk
              </>
            ) : (
              <>
                <Plus className="h-3 w-3" /> Stage hunk
              </>
            )}
          </Button>
        )}
      </div>
      <CodeMirror
        value={newText}
        theme="none"
        extensions={extensions}
        editable={false}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          searchKeymap: false,
        }}
        className={cn('text-xs', 'scm-diff-cm')}
      />
    </div>
  );
}

/** Translucent tint derived from a theme token (tokens are full oklch colors). */
function tint(token: string, percent: number): string {
  return `color-mix(in srgb, var(${token}) ${percent}%, transparent)`;
}

/**
 * Diff-specific styling layered over the shared editor theme: tints the
 * `@codemirror/merge` unified-view surfaces with the app's status tokens so
 * inserted/deleted regions stay legible on any theme, dark or light.
 */
const diffTheme = EditorView.theme({
  '&': { fontSize: '12px' },
  '.cm-changedLine': { backgroundColor: tint('--status-success', 12) },
  '.cm-changedText': { background: tint('--status-success', 30) },
  '.cm-deletedChunk': { backgroundColor: tint('--status-error', 10) },
  '.cm-deletedText': { background: tint('--status-error', 30) },
  '.cm-changedLineGutter': { backgroundColor: tint('--status-success', 35) },
  '.cm-deletedLineGutter': { backgroundColor: tint('--status-error', 35) },
  '.cm-collapsedLines': {
    background: tint('--muted', 60),
    color: 'var(--muted-foreground)',
    padding: '3px 12px',
  },
});
