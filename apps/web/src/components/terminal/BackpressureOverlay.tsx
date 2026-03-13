import { useState, useEffect, useCallback } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { TerminalEvents } from '@omniscribe/shared';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { getSocket } from '@/lib/socket';
import { Z_OVERLAY } from '@/lib/z-index';

const DEBOUNCE_MS = 500;

interface BackpressureOverlayProps {
  terminalSessionId: number;
}

/**
 * Semi-transparent overlay displayed when terminal output is backpressured.
 * Only appears after backpressure persists for 500ms to avoid flickering
 * on transient spikes. Disappears immediately when backpressure clears.
 */
export function BackpressureOverlay({ terminalSessionId }: BackpressureOverlayProps) {
  const isBackpressured = useTerminalStore(state => !!state.backpressured[terminalSessionId]);
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
    getSocket().emit(TerminalEvents.CANCEL, { sessionId: terminalSessionId });
  }, [terminalSessionId]);

  if (!visible) {
    return null;
  }

  return (
    <output
      data-testid="backpressure-overlay"
      aria-live="polite"
      className="absolute inset-0 bg-background/60 backdrop-blur-xs flex flex-col items-center justify-center gap-3"
      style={{ zIndex: Z_OVERLAY }}
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
    </output>
  );
}
