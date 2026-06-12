import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CloseConfirmDialogProps {
  /** The filename being closed (null ⇒ dialog hidden). */
  fileName: string | null;
  /** Save the file, then close it. */
  onSave: () => void;
  /** Discard changes and close. */
  onDiscard: () => void;
  /** Cancel the close (keep the file open). */
  onCancel: () => void;
}

/**
 * Confirmation shown when closing a file with unsaved changes. Reuses the
 * shared Dialog primitives so it matches the rest of the app's modals.
 */
export function CloseConfirmDialog({
  fileName,
  onSave,
  onDiscard,
  onCancel,
}: CloseConfirmDialogProps) {
  return (
    <Dialog open={fileName !== null} onOpenChange={open => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            {fileName ? (
              <>
                <span className="font-medium text-foreground">{fileName}</span> has unsaved changes.
                Do you want to save before closing?
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Don&apos;t save
          </Button>
          <Button onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
