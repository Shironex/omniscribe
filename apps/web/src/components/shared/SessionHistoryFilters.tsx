import { Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL_BRANCHES_VALUE = '__all__';

interface SessionHistoryFiltersProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  selectedBranch: string;
  onBranchChange: (branch: string) => void;
  uniqueBranches: string[];
  sortNewestFirst: boolean;
  onToggleSort: () => void;
}

export function SessionHistoryFilters({
  searchText,
  onSearchChange,
  selectedBranch,
  onBranchChange,
  uniqueBranches,
  sortNewestFirst,
  onToggleSort,
}: SessionHistoryFiltersProps) {
  return (
    <div className="px-3 py-2 border-b border-border shrink-0 space-y-1.5">
      {/* Search input */}
      <div className="relative">
        <Search
          size={12}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="text"
          placeholder="Search sessions..."
          value={searchText}
          onChange={e => onSearchChange(e.target.value)}
          className="h-auto pl-6 pr-2 py-1 text-xs bg-card border-border text-foreground-secondary"
          aria-label="Search sessions"
        />
      </div>

      {/* Branch filter + sort toggle */}
      <div className="flex items-center gap-1.5">
        <Select
          value={selectedBranch || ALL_BRANCHES_VALUE}
          onValueChange={value => onBranchChange(value === ALL_BRANCHES_VALUE ? '' : value)}
        >
          <SelectTrigger
            className="h-auto flex-1 text-2xs bg-card border-border px-1.5 py-0.5 text-foreground-secondary"
            aria-label="Filter by branch"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_BRANCHES_VALUE}>All branches</SelectItem>
            {uniqueBranches.map(b => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSort}
          className="h-auto w-auto p-1"
          title={sortNewestFirst ? 'Showing newest first' : 'Showing oldest first'}
          aria-label={sortNewestFirst ? 'Sort: showing newest first' : 'Sort: showing oldest first'}
        >
          <ArrowUpDown size={12} />
        </Button>
      </div>
    </div>
  );
}
