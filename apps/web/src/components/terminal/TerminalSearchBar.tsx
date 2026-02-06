import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { X, ChevronUp, ChevronDown, CaseSensitive, Regex } from 'lucide-react';
import { debounce } from '@/lib/debounce';

interface TerminalSearchBarProps {
  onSearch: (term: string, options: SearchOptions) => void;
  onNext: () => void;
  onPrevious: () => void;
  onClose: () => void;
}

export interface SearchOptions {
  caseSensitive: boolean;
  regex: boolean;
}

export const TerminalSearchBar: React.FC<TerminalSearchBarProps> = ({
  onSearch,
  onNext,
  onPrevious,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const debouncedSearch = useMemo(() => debounce(onSearch, 150), [onSearch]);

  useEffect(() => () => debouncedSearch.cancel(), [debouncedSearch]);

  useEffect(() => {
    debouncedSearch(query, { caseSensitive, regex });
  }, [query, caseSensitive, regex, debouncedSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          onPrevious();
        } else {
          onNext();
        }
      }
    },
    [onClose, onNext, onPrevious]
  );

  return (
    <div
      role="search"
      className="absolute top-1 right-1 z-10 flex items-center gap-1 bg-card border border-border rounded-md px-2 py-1 shadow-lg"
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Find..."
        className="bg-transparent text-foreground text-sm w-40 outline-none placeholder:text-muted-foreground"
      />

      <button
        type="button"
        onClick={() => setCaseSensitive(v => !v)}
        className={`p-0.5 rounded hover:bg-muted transition-colors ${
          caseSensitive ? 'text-primary bg-muted' : 'text-muted-foreground'
        }`}
        title="Case Sensitive"
      >
        <CaseSensitive size={14} />
      </button>

      <button
        type="button"
        onClick={() => setRegex(v => !v)}
        className={`p-0.5 rounded hover:bg-muted transition-colors ${
          regex ? 'text-primary bg-muted' : 'text-muted-foreground'
        }`}
        title="Regex"
      >
        <Regex size={14} />
      </button>

      <div className="w-px h-4 bg-border mx-0.5" />

      <button
        type="button"
        onClick={onPrevious}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Previous (Shift+Enter)"
      >
        <ChevronUp size={14} />
      </button>

      <button
        type="button"
        onClick={onNext}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Next (Enter)"
      >
        <ChevronDown size={14} />
      </button>

      <button
        type="button"
        onClick={onClose}
        className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title="Close (Escape)"
      >
        <X size={14} />
      </button>
    </div>
  );
};
