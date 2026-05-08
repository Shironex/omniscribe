import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getCustomCommandIcon } from '@/lib/custom-command-icons';
import { selectCommandsForProject, useCustomCommandStore } from '@/stores/useCustomCommandStore';
import type { CustomCommand, CustomCommandInput } from '@omniscribe/shared';
import { CustomCommandForm } from './CustomCommandForm';

interface CustomCommandsManagerProps {
  /** Active project context. Manager is disabled when null. */
  projectPath: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; id: string };

/**
 * CRUD UI for the active project's custom commands. Lives in a dialog and is
 * launched from the QuickActionsDropdown footer (or any other entry point).
 */
export function CustomCommandsManager({
  projectPath,
  open,
  onOpenChange,
}: CustomCommandsManagerProps) {
  const commandsSelector = useMemo(() => selectCommandsForProject(projectPath), [projectPath]);
  const commands = useCustomCommandStore(commandsSelector);
  const fetchForProject = useCustomCommandStore(state => state.fetchForProject);
  const createCommand = useCustomCommandStore(state => state.createCommand);
  const updateCommand = useCustomCommandStore(state => state.updateCommand);
  const deleteCommand = useCustomCommandStore(state => state.deleteCommand);
  const error = useCustomCommandStore(state => state.error);

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [busy, setBusy] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open && projectPath) {
      void fetchForProject(projectPath);
    }
  }, [open, projectPath, fetchForProject]);

  useEffect(() => {
    if (!open) {
      setMode({ kind: 'list' });
      setPendingDeleteId(null);
      setBusy(false);
    }
  }, [open]);

  const editing = mode.kind === 'edit' ? commands.find(cmd => cmd.id === mode.id) : undefined;

  const handleCreate = async (input: CustomCommandInput) => {
    if (!projectPath) return;
    setBusy(true);
    const result = await createCommand(projectPath, input);
    setBusy(false);
    if (result) setMode({ kind: 'list' });
  };

  const handleSaveEdit = async (input: CustomCommandInput) => {
    if (!projectPath || mode.kind !== 'edit') return;
    setBusy(true);
    const result = await updateCommand(projectPath, mode.id, input);
    setBusy(false);
    if (result) setMode({ kind: 'list' });
  };

  const handleDelete = async (id: string) => {
    if (!projectPath) return;
    setBusy(true);
    await deleteCommand(projectPath, id);
    setBusy(false);
    setPendingDeleteId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Custom Commands</DialogTitle>
          <DialogDescription>
            Per-project shell shortcuts. Each command spawns a fresh terminal session in the
            project's directory.
          </DialogDescription>
        </DialogHeader>

        {!projectPath && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Open a project to manage its custom commands.
          </div>
        )}

        {projectPath && mode.kind === 'list' && (
          <div className="flex flex-col gap-3">
            {commands.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No custom commands yet for this project.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {commands.map(cmd => (
                  <CommandRow
                    key={cmd.id}
                    command={cmd}
                    pendingDelete={pendingDeleteId === cmd.id}
                    busy={busy}
                    onEdit={() => setMode({ kind: 'edit', id: cmd.id })}
                    onRequestDelete={() => setPendingDeleteId(cmd.id)}
                    onCancelDelete={() => setPendingDeleteId(null)}
                    onConfirmDelete={() => handleDelete(cmd.id)}
                  />
                ))}
              </ul>
            )}

            {error && (
              <div className="text-xs text-destructive" role="alert">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => setMode({ kind: 'create' })}
                disabled={busy}
                className="gap-1.5"
              >
                <Plus size={14} />
                Add command
              </Button>
            </div>
          </div>
        )}

        {projectPath && mode.kind === 'create' && (
          <CustomCommandForm
            busy={busy}
            error={error}
            onCancel={() => setMode({ kind: 'list' })}
            onSubmit={handleCreate}
          />
        )}

        {projectPath && mode.kind === 'edit' && editing && (
          <CustomCommandForm
            initial={editing}
            busy={busy}
            error={error}
            onCancel={() => setMode({ kind: 'list' })}
            onSubmit={handleSaveEdit}
          />
        )}

        {projectPath && mode.kind === 'edit' && !editing && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              That command no longer exists. It may have been deleted in another window.
            </p>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setMode({ kind: 'list' })}>
                Back
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CommandRowProps {
  command: CustomCommand;
  pendingDelete: boolean;
  busy: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}

function CommandRow({
  command,
  pendingDelete,
  busy,
  onEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: CommandRowProps) {
  const Icon = getCustomCommandIcon(command.icon);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <span className="flex items-center justify-center h-7 w-7 mt-0.5 rounded bg-accent text-accent-foreground shrink-0">
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{command.label}</div>
        <div
          className={cn(
            'text-2xs font-mono text-muted-foreground mt-0.5 truncate',
            command.command.includes('\n') && 'whitespace-pre-wrap break-words'
          )}
        >
          {command.command.split('\n')[0]}
          {command.command.includes('\n') && '…'}
        </div>
      </div>
      {pendingDelete ? (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancelDelete}
            disabled={busy}
            className="h-7 px-2 text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onConfirmDelete}
            disabled={busy}
            className="h-7 px-2 text-xs"
          >
            Delete
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={onEdit}
            disabled={busy}
            aria-label={`Edit ${command.label}`}
            className="h-7 w-7"
          >
            <Pencil size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={onRequestDelete}
            disabled={busy}
            aria-label={`Delete ${command.label}`}
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      )}
    </li>
  );
}
