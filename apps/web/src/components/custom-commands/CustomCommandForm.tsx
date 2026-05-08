import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DEFAULT_CUSTOM_COMMAND_ICON,
  getCustomCommandIcon,
  type CustomCommandIconName,
} from '@/lib/custom-command-icons';
import type { CustomCommand, CustomCommandInput } from '@omniscribe/shared';
import { IconPicker } from './IconPicker';

interface CustomCommandFormProps {
  /** Existing command to edit, or undefined when creating a new one. */
  initial?: CustomCommand;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (input: CustomCommandInput) => void | Promise<void>;
}

/**
 * Reusable create/edit form for a single custom command. Owns its own draft
 * state (label / icon / command) and emits the trimmed payload on submit.
 */
export function CustomCommandForm({
  initial,
  busy = false,
  error,
  onCancel,
  onSubmit,
}: CustomCommandFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [icon, setIcon] = useState<CustomCommandIconName | string>(
    initial?.icon ?? DEFAULT_CUSTOM_COMMAND_ICON
  );
  const [commandText, setCommandText] = useState(initial?.command ?? '');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLabel(initial?.label ?? '');
    setIcon(initial?.icon ?? DEFAULT_CUSTOM_COMMAND_ICON);
    setCommandText(initial?.command ?? '');
    setLocalError(null);
  }, [initial]);

  const Icon = getCustomCommandIcon(icon);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setLocalError('Label is required');
      return;
    }
    if (!commandText.trim()) {
      setLocalError('Command is required');
      return;
    }
    setLocalError(null);
    void onSubmit({
      label: trimmedLabel,
      icon: typeof icon === 'string' ? icon : DEFAULT_CUSTOM_COMMAND_ICON,
      command: commandText,
    });
  };

  const displayError = localError ?? error ?? null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="custom-command-label" className="text-xs font-medium text-foreground">
          Label
        </label>
        <Input
          id="custom-command-label"
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Run dev server"
          maxLength={120}
          autoFocus
          required
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="custom-command-text" className="text-xs font-medium text-foreground">
          Command
        </label>
        <textarea
          id="custom-command-text"
          value={commandText}
          onChange={e => setCommandText(e.target.value)}
          placeholder="e.g. pnpm dev"
          rows={4}
          maxLength={8000}
          required
          disabled={busy}
          className={cn(
            'font-mono text-xs rounded-md border border-input bg-transparent px-3 py-2 shadow-sm transition-colors',
            'placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-20'
          )}
        />
        <p className="text-2xs text-muted-foreground">
          Runs as-is in a fresh shell in the project directory. Multi-line allowed.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-foreground flex items-center gap-2">
          Icon
          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-accent text-accent-foreground">
            <Icon size={12} />
          </span>
        </label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {displayError && (
        <div className="text-xs text-destructive" role="alert">
          {displayError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {initial ? 'Save changes' : 'Add command'}
        </Button>
      </div>
    </form>
  );
}
