import { useMemo } from 'react';
import { usePluginStore } from '@/stores/usePluginStore';
import { buildAiModeOptions, type AiModeOption } from '@/lib/ai-mode-utils';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AiMode } from '@omniscribe/shared';

interface AiModeDropdownProps {
  value: AiMode;
  onChange: (mode: AiMode) => void;
  /** Which direction the dropdown expands */
  direction?: 'up' | 'down';
  className?: string;
}

export function AiModeDropdown({
  value,
  onChange,
  direction = 'down',
  className,
}: AiModeDropdownProps) {
  const providers = usePluginStore(s => s.providers);
  const statusRenderers = usePluginStore(s => s.statusRenderers);

  const options = useMemo(
    () => buildAiModeOptions(providers, statusRenderers),
    [providers, statusRenderers]
  );

  const selectedOption = options.find(o => o.value === value) ?? options[0];
  if (!selectedOption) return null;

  const SelectedIcon = selectedOption.icon;

  return (
    <Select value={value} onValueChange={v => onChange(v as AiMode)}>
      <SelectTrigger className={cn('min-w-[100px] h-7 text-xs gap-1.5', className)}>
        {/* flex! overrides line-clamp-1's -webkit-box display from SelectTrigger */}
        <span className="flex! items-center gap-1.5 truncate">
          <SelectedIcon size={14} className={cn(selectedOption.color, 'shrink-0')} />
          <span data-testid="ai-mode-label">{selectedOption.label}</span>
        </span>
      </SelectTrigger>
      <SelectContent side={direction === 'up' ? 'top' : 'bottom'}>
        {options.map(option => (
          <AiModeSelectItem key={option.value} option={option} />
        ))}
      </SelectContent>
    </Select>
  );
}

function AiModeSelectItem({ option }: { option: AiModeOption }) {
  const Icon = option.icon;
  return (
    <SelectItem value={option.value} disabled={option.disabled} className="text-xs">
      <span className="flex items-center gap-1.5">
        <Icon size={14} className={cn(option.color, 'shrink-0')} />
        <span>{option.label}</span>
        {option.disabled && (
          <span className="ml-auto text-[10px] text-muted-foreground">Not installed</span>
        )}
      </span>
    </SelectItem>
  );
}
