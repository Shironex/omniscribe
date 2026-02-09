import { useState, useMemo, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronDown, Search, GitBranch, Check, Plus } from 'lucide-react';

export interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent?: boolean;
}

interface BranchSelectorProps {
  branches: Branch[];
  currentBranch: string;
  onSelect: (branchName: string) => void;
  onCreateBranch?: (branchName: string) => void;
  disabled?: boolean;
  className?: string;
}

export function BranchSelector({
  branches,
  currentBranch,
  onSelect,
  onCreateBranch,
  disabled = false,
  className,
}: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter and group branches
  const { localBranches, remoteBranches } = useMemo(() => {
    const filtered = branches.filter(branch =>
      branch.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      localBranches: filtered.filter(b => !b.isRemote),
      remoteBranches: filtered.filter(b => b.isRemote),
    };
  }, [branches, searchQuery]);

  const handleSelect = (branchName: string) => {
    onSelect(branchName);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleCreateBranch = () => {
    if (searchQuery.trim() && onCreateBranch) {
      onCreateBranch(searchQuery.trim());
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const showCreateOption =
    searchQuery.trim() &&
    onCreateBranch &&
    !branches.some(b => b.name.toLowerCase() === searchQuery.toLowerCase());

  return (
    <div ref={containerRef} className={twMerge(clsx('relative', className))}>
      {/* Trigger button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded',
          'bg-card border border-border',
          'text-sm text-foreground',
          'transition-colors',
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-border hover:border-muted-foreground'
        )}
      >
        <GitBranch size={14} className="text-foreground-secondary" />
        <span className="truncate max-w-32">{currentBranch}</span>
        <ChevronDown
          size={14}
          className={clsx('text-muted-foreground transition-transform', isOpen && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={clsx(
            'absolute top-full left-0 mt-1 z-50',
            'w-64 max-h-80 overflow-hidden',
            'bg-muted border border-border rounded-lg shadow-xl',
            'animate-fade-in'
          )}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search branches..."
                className={clsx(
                  'w-full pl-8 pr-3 py-1.5 rounded',
                  'bg-card border border-border',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:border-primary'
                )}
              />
            </div>
          </div>

          {/* Branch list */}
          <div className="max-h-56 overflow-y-auto">
            {/* Local branches */}
            {localBranches.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
                  Local
                </div>
                {localBranches.map(branch => (
                  <button
                    key={branch.name}
                    onClick={() => handleSelect(branch.name)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-1.5',
                      'text-sm text-left transition-colors',
                      branch.name === currentBranch
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-card'
                    )}
                  >
                    <GitBranch size={14} className="shrink-0" />
                    <span className="truncate flex-1">{branch.name}</span>
                    {branch.name === currentBranch && (
                      <Check size={14} className="shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Remote branches */}
            {remoteBranches.length > 0 && (
              <div>
                <div className="px-3 py-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wide border-t border-border mt-1 pt-2">
                  Remote
                </div>
                {remoteBranches.map(branch => (
                  <button
                    key={branch.name}
                    onClick={() => handleSelect(branch.name)}
                    className={clsx(
                      'w-full flex items-center gap-2 px-3 py-1.5',
                      'text-sm text-left transition-colors',
                      branch.name === currentBranch
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground-secondary hover:bg-card hover:text-foreground'
                    )}
                  >
                    <GitBranch size={14} className="shrink-0" />
                    <span className="truncate flex-1">{branch.name}</span>
                    {branch.name === currentBranch && (
                      <Check size={14} className="shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Empty state */}
            {localBranches.length === 0 && remoteBranches.length === 0 && !showCreateOption && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No branches found
              </div>
            )}
          </div>

          {/* Create new branch option */}
          {showCreateOption && (
            <div className="border-t border-border">
              <button
                onClick={handleCreateBranch}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2',
                  'text-sm text-primary',
                  'hover:bg-card transition-colors'
                )}
              >
                <Plus size={14} />
                <span>
                  Create branch <strong>"{searchQuery}"</strong>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
