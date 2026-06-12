import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ExternalChangeBannerProps {
  /** Reload: take the disk content, discarding local edits. */
  onReload: () => void;
  /** Keep: keep the in-memory buffer, ignoring the disk change. */
  onKeep: () => void;
}

/**
 * Surfaced above the editor when an open, dirty file changed on disk underneath
 * the buffer. The user resolves the conflict explicitly: Reload (take disk) or
 * Keep (keep edits).
 */
export function ExternalChangeBanner({ onReload, onKeep }: ExternalChangeBannerProps) {
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-3 border-b border-status-warning/40 bg-status-warning-bg px-3 py-2 text-xs"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" aria-hidden />
      <span className="flex-1 text-foreground">
        This file changed on disk while you had unsaved edits.
      </span>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onKeep}>
        Keep mine
      </Button>
      <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={onReload}>
        Reload
      </Button>
    </div>
  );
}
