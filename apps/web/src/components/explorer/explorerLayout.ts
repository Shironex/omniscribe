/**
 * localStorage-backed persistence for the explorer panel's open/closed state
 * and width. Single key (`omniscribe-explorer`) holding a small JSON blob.
 */

const STORAGE_KEY = 'omniscribe-explorer';

/** Which tab of the side panel is active. */
export type ExplorerTab = 'files' | 'scm';

export interface ExplorerLayout {
  open: boolean;
  width: number;
  /** Active side-panel tab (Files vs Source Control). */
  tab: ExplorerTab;
}

export const EXPLORER_MIN_WIDTH = 180;
export const EXPLORER_MAX_WIDTH = 600;
export const EXPLORER_DEFAULT_WIDTH = 260;

const DEFAULT_LAYOUT: ExplorerLayout = {
  open: false,
  width: EXPLORER_DEFAULT_WIDTH,
  tab: 'files',
};

function normalizeTab(value: unknown): ExplorerTab {
  return value === 'scm' ? 'scm' : 'files';
}

export function loadExplorerLayout(): ExplorerLayout {
  if (typeof window === 'undefined') return { ...DEFAULT_LAYOUT };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<ExplorerLayout>;
    return {
      open: typeof parsed.open === 'boolean' ? parsed.open : DEFAULT_LAYOUT.open,
      width: clampWidth(typeof parsed.width === 'number' ? parsed.width : DEFAULT_LAYOUT.width),
      tab: normalizeTab(parsed.tab),
    };
  } catch {
    return { ...DEFAULT_LAYOUT };
  }
}

export function saveExplorerLayout(layout: ExplorerLayout): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        open: layout.open,
        width: clampWidth(layout.width),
        tab: normalizeTab(layout.tab),
      })
    );
  } catch {
    // Ignore quota / serialization failures — layout is non-critical.
  }
}

export function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return EXPLORER_DEFAULT_WIDTH;
  return Math.min(EXPLORER_MAX_WIDTH, Math.max(EXPLORER_MIN_WIDTH, Math.round(width)));
}
