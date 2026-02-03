import * as React from 'react';
import { Check, ChevronsUpDown, GitBranch, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
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

interface BranchAutocompleteProps {
  branches: Branch[];
  value: string | null;
  onChange: (branchName: string) => void;
  onCreateBranch?: (branchName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
}

export function BranchAutocomplete({
  branches,
  value,
  onChange,
  onCreateBranch,
  placeholder = 'Select branch...',
  disabled = false,
  className,
  side = 'bottom',
  align = 'start',
}: BranchAutocompleteProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [triggerWidth, setTriggerWidth] = React.useState<number>(0);

  // Measure trigger width for popover
  React.useEffect(() => {
    if (triggerRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setTriggerWidth(entry.contentRect.width);
        }
      });
      observer.observe(triggerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  // Filter branches based on search
  const filteredBranches = React.useMemo(() => {
    if (!search) return branches;
    const lower = search.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(lower));
  }, [branches, search]);

  // Separate local and remote branches
  const localBranches = filteredBranches.filter((b) => !b.isRemote);
  const remoteBranches = filteredBranches.filter((b) => b.isRemote);

  // Check if search matches an existing branch
  const searchMatchesExisting = React.useMemo(() => {
    if (!search.trim()) return true;
    return branches.some((b) => b.name.toLowerCase() === search.toLowerCase());
  }, [branches, search]);

  // Validate branch name
  const isValidBranchName = React.useMemo(() => {
    if (!search.trim()) return false;
    // Git branch name rules: no spaces, ~, ^, :, ?, *, [, ], \
    return !/[\s~^:?*[\]\\]/.test(search);
  }, [search]);

  // Can create if it's a valid name that doesn't exist
  // If onCreateBranch is provided, call it; otherwise just select the name (worktree will create branch)
  const canCreateBranch = !searchMatchesExisting && isValidBranchName;

  const handleSelect = (branchName: string) => {
    onChange(branchName);
    setOpen(false);
    setSearch('');
  };

  const handleCreateBranch = () => {
    if (canCreateBranch) {
      const branchName = search.trim();
      if (onCreateBranch) {
        onCreateBranch(branchName);
      }
      // Always select the branch name - worktree system will handle creation
      onChange(branchName);
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('justify-between font-normal', className)}
        >
          <div className="flex items-center gap-2 truncate">
            <GitBranch className="h-4 w-4 shrink-0 opacity-70" />
            <span className="truncate">{value || placeholder}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        style={{ width: Math.max(triggerWidth, 280) }}
        side={side}
        align={align}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search branches..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {/* Create new branch option - show at top when search doesn't match */}
            {canCreateBranch && (
              <>
                <CommandGroup heading="Create New">
                  <CommandItem onSelect={handleCreateBranch} className="text-primary">
                    <Plus className="mr-2 h-4 w-4" />
                    <span>Create branch "{search}"</span>
                  </CommandItem>
                </CommandGroup>
                {(localBranches.length > 0 || remoteBranches.length > 0) && <CommandSeparator />}
              </>
            )}

            <CommandEmpty>
              {search && !isValidBranchName ? (
                <span className="text-destructive">Invalid branch name</span>
              ) : (
                'No branches found.'
              )}
            </CommandEmpty>

            {/* Local branches */}
            {localBranches.length > 0 && (
              <CommandGroup heading="Local">
                {localBranches.map((branch) => (
                  <CommandItem
                    key={branch.name}
                    value={branch.name}
                    onSelect={() => handleSelect(branch.name)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === branch.name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <GitBranch className="mr-2 h-4 w-4 opacity-70" />
                    <span className="truncate">{branch.name}</span>
                    {branch.isCurrent && (
                      <span className="ml-auto text-xs text-muted-foreground">current</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Remote branches */}
            {remoteBranches.length > 0 && (
              <CommandGroup heading="Remote">
                {remoteBranches.map((branch) => (
                  <CommandItem
                    key={branch.name}
                    value={branch.name}
                    onSelect={() => handleSelect(branch.name)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === branch.name ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <GitBranch className="mr-2 h-4 w-4 opacity-70" />
                    <span className="truncate">{branch.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
