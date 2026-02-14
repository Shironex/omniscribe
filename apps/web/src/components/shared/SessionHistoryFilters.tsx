import { Search, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        <input
          type="text"
          placeholder="Search sessions..."
          value={searchText}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full pl-6 pr-2 py-1 text-xs bg-card border border-border rounded text-foreground-secondary placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Search sessions"
        />
      </div>

      {/* Branch filter + sort toggle */}
      <div className="flex items-center gap-1.5">
        <select
          value={selectedBranch}
          onChange={e => onBranchChange(e.target.value)}
          className="flex-1 text-2xs bg-card border border-border rounded px-1.5 py-0.5 text-foreground-secondary focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter by branch"
        >
          <option value="">All branches</option>
          {uniqueBranches.map(b => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
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
