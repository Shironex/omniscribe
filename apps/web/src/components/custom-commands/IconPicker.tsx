import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  CUSTOM_COMMAND_ICON_NAMES,
  getCustomCommandIcon,
  type CustomCommandIconName,
} from '@/lib/custom-command-icons';

interface IconPickerProps {
  /** Currently selected icon name (one of CUSTOM_COMMAND_ICON_NAMES). */
  value: string;
  /** Called with the chosen icon name. */
  onChange: (icon: CustomCommandIconName) => void;
  className?: string;
}

/**
 * Searchable grid of curated Lucide icons for use inside custom-command forms.
 * Returns the chosen icon's stable name (string) — never a component — so the
 * value can be persisted directly.
 */
export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CUSTOM_COMMAND_ICON_NAMES;
    return CUSTOM_COMMAND_ICON_NAMES.filter(name => name.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Input
        type="text"
        placeholder="Search icons…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        aria-label="Search icons"
      />
      <div
        role="listbox"
        aria-label="Icon"
        className="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto p-1 rounded-md border border-border bg-background"
      >
        {filtered.map(name => {
          const Icon = getCustomCommandIcon(name);
          const selected = name === value;
          return (
            <button
              type="button"
              key={name}
              role="option"
              aria-selected={selected}
              onClick={() => onChange(name)}
              title={name}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                selected && 'bg-primary/15 text-primary ring-1 ring-primary'
              )}
            >
              <Icon size={16} />
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="col-span-8 text-xs text-muted-foreground text-center py-3">
            No icons match “{query}”.
          </div>
        )}
      </div>
    </div>
  );
}
