import { useState, useEffect, useCallback } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { TerminalEvents } from '@omniscribe/shared';
import { useSessionStore } from '@/stores/useSessionStore';
import { socket } from '@/lib/socket';

const DEBOUNCE_MS = 300;

interface BackpressureOverlayProps {
  terminalSessionId: number;
}

/**
 * Semi-transparent overlay displayed when terminal output is backpressured.
 * Only appears after backpressure persists for 300ms to avoid flickering
 * on transient spikes. Disappears immediately when backpressure clears.
 */
export function BackpressureOverlay({ terminalSessionId }: BackpressureOverlayProps) {
  const isBackpressured = useSessionStore(state => !!state.backpressured[terminalSessionId]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isBackpressured) {
      setVisible(false);
      return;
    }

    const timer = setTimeout(() => setVisible(true), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isBackpressured]);

  const handleCancel = useCallback(() => {
    socket.emit(TerminalEvents.CANCEL, { sessionId: terminalSessionId });
  }, [terminalSessionId]);

  if (!visible) {
    return null;
  }

  return (
    <div
      data-testid="backpressure-overlay"
      className="absolute inset-0 bg-background/60 backdrop-blur-xs z-10 flex flex-col items-center justify-center gap-3"
    >
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Buffering output...</span>
      <button
        type="button"
        onClick={handleCancel}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-destructive-foreground bg-destructive/80 hover:bg-destructive transition-colors"
      >
        <XCircle size={12} />
        Cancel output
      </button>
    </div>
  );
}
