import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, GitBranch, Check, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

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
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { localBranches, remoteBranches } = useMemo(() => {
    const local: Branch[] = [];
    const remote: Branch[] = [];
    for (const b of branches) {
      (b.isRemote ? remote : local).push(b);
    }
    return { localBranches: local, remoteBranches: remote };
  }, [branches]);

  const showCreateOption =
    searchQuery.trim() &&
    onCreateBranch &&
    !branches.some(b => b.name.toLowerCase() === searchQuery.toLowerCase());

  const handleSelect = (branchName: string) => {
    onSelect(branchName);
    setOpen(false);
    setSearchQuery('');
  };

  const handleCreateBranch = () => {
    if (searchQuery.trim() && onCreateBranch) {
      onCreateBranch(searchQuery.trim());
      setOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (!nextOpen) setSearchQuery('');
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Select branch"
          disabled={disabled}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded',
            'bg-card border border-border',
            'text-sm text-foreground',
            'transition-colors',
            disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-border hover:border-muted-foreground',
            className
          )}
        >
          <GitBranch size={14} className="text-foreground-secondary" />
          <span className="truncate max-w-32">{currentBranch}</span>
          <ChevronDown
            size={14}
            className={cn('text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="start" onCloseAutoFocus={e => e.preventDefault()}>
        <Command shouldFilter={true}>
          <CommandInput
            placeholder="Search branches..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No branches found</CommandEmpty>

            {localBranches.length > 0 && (
              <CommandGroup heading="Local">
                {localBranches.map(branch => (
                  <CommandItem
                    key={branch.name}
                    value={branch.name}
                    onSelect={() => handleSelect(branch.name)}
                    className={cn(
                      'gap-2',
                      branch.name === currentBranch && 'bg-primary/10 text-primary'
                    )}
                  >
                    <GitBranch size={14} className="shrink-0" />
                    <span className="truncate flex-1">{branch.name}</span>
                    {branch.name === currentBranch && (
                      <Check size={14} className="shrink-0 text-primary" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {remoteBranches.length > 0 && (
              <>
                {localBranches.length > 0 && <CommandSeparator />}
                <CommandGroup heading="Remote">
                  {remoteBranches.map(branch => (
                    <CommandItem
                      key={branch.name}
                      value={branch.name}
                      onSelect={() => handleSelect(branch.name)}
                      className={cn(
                        'gap-2',
                        branch.name === currentBranch
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground-secondary'
                      )}
                    >
                      <GitBranch size={14} className="shrink-0" />
                      <span className="truncate flex-1">{branch.name}</span>
                      {branch.name === currentBranch && (
                        <Check size={14} className="shrink-0 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {showCreateOption && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={handleCreateBranch} className="gap-2 text-primary">
                    <Plus size={14} />
                    <span>
                      Create branch <strong>"{searchQuery}"</strong>
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
