/**
 * localStorage-backed persistence for the editor split's size. The editor
 * occupies the leading pane of a vertical split with the session/terminal grid
 * below it; this stores the editor pane's height as a percentage of the main
 * content area.
 *
 * Single key (`omniscribe-editor`) holding a small JSON blob, mirroring the
 * explorer panel's `omniscribe-explorer` convention.
 */

const STORAGE_KEY = 'omniscribe-editor';

export interface EditorLayout {
  /** Editor pane size as a percentage of the split (0–100). */
  size: number;
}

export const EDITOR_MIN_SIZE = 20;
export const EDITOR_MAX_SIZE = 80;
export const EDITOR_DEFAULT_SIZE = 55;

const DEFAULT_LAYOUT: EditorLayout = { size: EDITOR_DEFAULT_SIZE };

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return EDITOR_DEFAULT_SIZE;
  return Math.min(EDITOR_MAX_SIZE, Math.max(EDITOR_MIN_SIZE, size));
}

export function loadEditorLayout(): EditorLayout {
  if (typeof window === 'undefined') return { ...DEFAULT_LAYOUT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<EditorLayout>;
    return {
      size: clampSize(typeof parsed.size === 'number' ? parsed.size : DEFAULT_LAYOUT.size),
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveEditorLayout(layout: EditorLayout): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ size: clampSize(layout.size) }));
  } catch {
    // Ignore quota / serialization failures — layout is non-critical.
  }
}
