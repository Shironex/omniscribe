import { useCallback, useState } from 'react';
import { loadExplorerLayout, saveExplorerLayout } from '@/components/explorer/explorerLayout';

export interface SidePanelControl {
  /** Whether the side panel is currently expanded. */
  open: boolean;
  /** Set the open state explicitly (persists to localStorage). */
  setOpen: (open: boolean) => void;
  /** Toggle the open state (rail footer button). */
  toggle: () => void;
}

/**
 * Owns the side panel's open/closed state, lifted to the shell so both the
 * panel itself and the rail footer's reopen toggle share one source of truth.
 *
 * The open flag is persisted alongside the panel's width/tab under the existing
 * `omniscribe-explorer` localStorage key (width/tab are still owned by the
 * panel; we merge so neither clobbers the other).
 */
export function useSidePanel(): SidePanelControl {
  const [open, setOpenState] = useState(() => loadExplorerLayout().open);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    // Merge with the panel's persisted width/tab so we don't clobber them.
    const current = loadExplorerLayout();
    saveExplorerLayout({ ...current, open: next });
  }, []);

  const toggle = useCallback(() => {
    setOpenState(prev => {
      const next = !prev;
      const current = loadExplorerLayout();
      saveExplorerLayout({ ...current, open: next });
      return next;
    });
  }, []);

  return { open, setOpen, toggle };
}
