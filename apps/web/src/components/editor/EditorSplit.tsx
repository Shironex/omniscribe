import { useCallback, useEffect, useRef } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { useEditorStore, selectHasOpenFiles } from '@/stores/useEditorStore';
import { EditorPanel } from './EditorPanel';
import {
  loadEditorLayout,
  saveEditorLayout,
  EDITOR_MIN_SIZE,
  EDITOR_MAX_SIZE,
} from './editorLayout';

interface EditorSplitProps {
  /**
   * The main-area content (persistent grids + overlay views). Rendered alone
   * when no files are open, and as the trailing pane of a vertical split with
   * the editor when ≥1 file is open.
   */
  children: React.ReactNode;
}

/**
 * Wraps the main content area. When the editor has open files it splits the
 * area vertically — editor on top, sessions below — using the same
 * `react-resizable-panels` primitives the terminal grid uses. When nothing is
 * open it renders the children untouched so the layout is identical to before.
 *
 * The split size is persisted to `localStorage` (`omniscribe-editor`), and
 * every layout change dispatches `terminal-refit-all` (two rAFs after the DOM
 * settles) so terminals recompute their dimensions — mirroring the explorer
 * panel's resize behavior.
 */
export function EditorSplit({ children }: EditorSplitProps) {
  const hasOpenFiles = useEditorStore(selectHasOpenFiles);
  const initialSize = useRef(loadEditorLayout().size);

  // Dispatch a terminal refit two rAFs after the split appears/disappears so
  // the grid recalculates against its new height.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      });
    });
    return () => cancelAnimationFrame(id);
  }, [hasOpenFiles]);

  const handleLayoutChange = useCallback((layout: Layout) => {
    // The editor occupies the leading panel (id="editor"); persist its size.
    const editorSize = layout['editor'];
    if (typeof editorSize === 'number') {
      saveEditorLayout({ size: editorSize });
    }
    // Terminals below the split need to refit as the divider drags.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('terminal-refit-all'));
      });
    });
  }, []);

  // No files open — layout is exactly as before (no split, no wrappers added).
  if (!hasOpenFiles) {
    return <>{children}</>;
  }

  return (
    <Group
      orientation="vertical"
      onLayoutChange={handleLayoutChange}
      className="h-full w-full min-h-0 min-w-0"
    >
      <Panel
        id="editor"
        defaultSize={initialSize.current}
        minSize={EDITOR_MIN_SIZE}
        maxSize={EDITOR_MAX_SIZE}
        className="min-h-0 min-w-0 overflow-hidden"
      >
        <EditorPanel />
      </Panel>
      <Separator className="h-1.5 flex items-center justify-center group">
        <div className="w-10 h-0.5 bg-border/60 rounded-full group-hover:bg-primary/60 group-hover:w-12 transition-all duration-200" />
      </Separator>
      <Panel id="sessions" minSize={20} className="relative min-h-0 min-w-0 overflow-hidden">
        {children}
      </Panel>
    </Group>
  );
}
