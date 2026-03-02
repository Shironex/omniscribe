import { useState, useRef, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePluginStore } from '@/stores/usePluginStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { buildAiModeOptions, type AiModeOption } from '@/lib/ai-mode-utils';
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
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const providers = usePluginStore(s => s.providers);
  const statusRenderers = usePluginStore(s => s.statusRenderers);

  const options = useMemo(
    () => buildAiModeOptions(providers, statusRenderers),
    [providers, statusRenderers]
  );

  useClickOutside(dropdownRef, () => {
    if (isOpen) setIsOpen(false);
  });

  const selectedOption = options.find(o => o.value === value) ?? options[0];
  const SelectedIcon = selectedOption.icon;

  return (
    <div ref={dropdownRef} className={cn('relative', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(prev => !prev)}
        className="min-w-[100px] text-xs"
      >
        <SelectedIcon size={14} className={selectedOption.color} />
        <span data-testid="ai-mode-label">{selectedOption.label}</span>
        <ChevronDown
          size={12}
          className={cn(
            'text-muted-foreground transition-transform ml-auto',
            isOpen && 'rotate-180'
          )}
        />
      </Button>

      {isOpen && (
        <div
          className={cn(
            'absolute left-0 z-50',
            'bg-muted border border-border rounded-lg shadow-xl',
            'overflow-hidden animate-fade-in min-w-[120px]',
            direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
          )}
        >
          {options.map(option => (
            <AiModeOptionButton
              key={option.value}
              option={option}
              isSelected={option.value === value}
              onSelect={() => {
                if (option.disabled) return;
                onChange(option.value);
                setIsOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AiModeOptionButton({
  option,
  isSelected,
  onSelect,
}: {
  option: AiModeOption;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const Icon = option.icon;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onSelect}
      disabled={option.disabled}
      title={option.disabledReason}
      className={cn('w-full justify-start text-xs', isSelected && 'bg-primary/10 text-primary')}
    >
      <Icon size={14} className={option.color} />
      <span>{option.label}</span>
      {option.disabled && (
        <span className="ml-auto text-[10px] text-muted-foreground">Not installed</span>
      )}
    </Button>
  );
}
