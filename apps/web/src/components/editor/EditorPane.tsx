import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { EditorView, type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { loadLanguage } from '@uiw/codemirror-extensions-langs';
import type { Extension } from '@codemirror/state';
import { cn } from '@/lib/utils';
import { buildEditorTheme, observeEditorTheme } from './editorTheme';
import type { OpenFile } from '@/stores/useEditorStore';
import { BinaryPlaceholder } from './BinaryPlaceholder';

interface EditorPaneProps {
  file: OpenFile;
  /** Called with the new content on every edit. */
  onChange: (content: string) => void;
  /** Save the active file (Cmd/Ctrl+S, scoped to editor focus). */
  onSave: () => void;
  /** Close the active file (Cmd/Ctrl+W, scoped to editor focus). */
  onClose: () => void;
}

/** Derive the lowercase extension used to key the language loader. */
function extensionOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base.toLowerCase();
  return base.slice(dot + 1).toLowerCase();
}

/**
 * A single CodeMirror editor instance bound to one open file. The theme is
 * built from CSS tokens and rebuilt on theme change; the language is resolved
 * from the file extension.
 */
export function EditorPane({ file, onChange, onSave, onClose }: EditorPaneProps) {
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Rebuild the theme extension whenever the active theme class changes.
  const [themeExt, setThemeExt] = useState<Extension>(() => buildEditorTheme());
  useEffect(() => {
    const dispose = observeEditorTheme(() => {
      setThemeExt(buildEditorTheme());
    });
    return dispose;
  }, []);

  // Resolve the language extension for this file (memoized on its extension).
  const ext = extensionOf(file.path);
  const langExt = useMemo<Extension | null>(() => {
    try {
      return loadLanguage(ext as Parameters<typeof loadLanguage>[0]) ?? null;
    } catch {
      return null;
    }
  }, [ext]);

  const editable = !file.readOnly;

  // Editor-scoped keybindings: Cmd/Ctrl+S save, Cmd/Ctrl+W close. We capture at
  // the wrapper so the global app shortcut (Cmd+W closes a tab) does not also
  // fire — stopPropagation keeps the action local to the focused editor.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === 's' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onSave();
      } else if (key === 'w' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    },
    [onSave, onClose]
  );

  const extensions = useMemo<Extension[]>(() => {
    const list: Extension[] = [themeExt, EditorView.lineWrapping];
    if (langExt) list.push(langExt);
    if (!editable) list.push(EditorView.editable.of(false));
    return list;
  }, [themeExt, langExt, editable]);

  // Binary / too-large files render a friendly placeholder rather than an editor.
  if (file.binary || file.tooLarge) {
    return <BinaryPlaceholder file={file} />;
  }

  if (file.loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (file.error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        {file.error}
      </div>
    );
  }

  return (
    <div
      className={cn('relative h-full w-full overflow-hidden bg-background')}
      onKeyDownCapture={handleKeyDown}
    >
      <CodeMirror
        ref={editorRef}
        value={file.content}
        height="100%"
        className="h-full text-[13px]"
        theme="none"
        extensions={extensions}
        editable={editable}
        readOnly={!editable}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: editable,
          highlightActiveLineGutter: editable,
          foldGutter: true,
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: editable,
          highlightSelectionMatches: true,
        }}
        onChange={onChange}
        style={{ height: '100%' }}
      />
    </div>
  );
}
