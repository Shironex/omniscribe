import { useRef, useState, useCallback } from 'react';
import type { SearchAddon } from '@xterm/addon-search';
import type { Terminal } from '@xterm/xterm';
import type { SearchOptions } from '@/components/terminal/TerminalSearchBar';

export interface UseTerminalSearchReturn {
  showSearch: boolean;
  setShowSearch: React.Dispatch<React.SetStateAction<boolean>>;
  searchAddonRef: React.MutableRefObject<SearchAddon | null>;
  handleSearch: (term: string, options: SearchOptions) => void;
  handleSearchNext: () => void;
  handleSearchPrevious: () => void;
  handleSearchClose: () => void;
}

/**
 * Hook that manages terminal search state and handlers.
 */
export function useTerminalSearch(
  xtermRef: React.MutableRefObject<Terminal | null>
): UseTerminalSearchReturn {
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchTermRef = useRef('');
  const [showSearch, setShowSearch] = useState(false);

  const handleSearch = useCallback((term: string, options: SearchOptions) => {
    searchTermRef.current = term;
    if (!searchAddonRef.current) return;
    if (!term) {
      searchAddonRef.current.clearDecorations();
      return;
    }
    searchAddonRef.current.findNext(term, {
      caseSensitive: options.caseSensitive,
      regex: options.regex,
    });
  }, []);

  const handleSearchNext = useCallback(() => {
    const searchTerm = searchTermRef.current;
    if (!searchTerm) return;
    searchAddonRef.current?.findNext(searchTerm);
  }, []);

  const handleSearchPrevious = useCallback(() => {
    const searchTerm = searchTermRef.current;
    if (!searchTerm) return;
    searchAddonRef.current?.findPrevious(searchTerm);
  }, []);

  const handleSearchClose = useCallback(() => {
    searchAddonRef.current?.clearDecorations();
    searchTermRef.current = '';
    setShowSearch(false);
    xtermRef.current?.focus();
  }, [xtermRef]);

  return {
    showSearch,
    setShowSearch,
    searchAddonRef,
    handleSearch,
    handleSearchNext,
    handleSearchPrevious,
    handleSearchClose,
  };
}
