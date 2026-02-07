import { useState, useEffect, useRef } from 'react';
import { Loader2, WifiOff, CheckCircle2 } from 'lucide-react';
import { useConnectionStore } from '@/stores/useConnectionStore';

/**
 * Semi-transparent overlay displayed on terminal panels during WebSocket
 * disconnection. Shows "Reconnecting..." with a spinner while attempting
 * to reconnect, switches to "Connection lost" with a Retry button after
 * the 30-second timeout, and flashes a brief "Reconnected" badge on
 * successful reconnection before disappearing.
 */
export function ReconnectionOverlay() {
  const status = useConnectionStore(state => state.status);
  const retryConnection = useConnectionStore(state => state.retryConnection);

  // Track whether we should show the brief "Reconnected" flash
  const [showReconnected, setShowReconnected] = useState(false);
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = status;

    // Transition from non-connected to connected: show brief flash
    if (status === 'connected' && prevStatus !== 'connected') {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Connected and not in the flash window: render nothing
  if (status === 'connected' && !showReconnected) {
    return null;
  }

  // Brief "Reconnected" flash
  if (status === 'connected' && showReconnected) {
    return (
      <div
        data-testid="reconnection-overlay"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2 transition-opacity duration-300"
      >
        <CheckCircle2 className="h-6 w-6 text-green-500" />
        <span className="text-sm text-green-500 font-medium">Reconnected</span>
      </div>
    );
  }

  // Reconnecting state
  if (status === 'reconnecting') {
    return (
      <div
        data-testid="reconnection-overlay"
        className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Reconnecting...</span>
      </div>
    );
  }

  // Failed state
  return (
    <div
      data-testid="reconnection-overlay"
      className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3"
    >
      <WifiOff className="h-6 w-6 text-destructive" />
      <span className="text-sm text-destructive">Connection lost</span>
      <button
        type="button"
        className="text-xs text-primary hover:underline cursor-pointer"
        onClick={retryConnection}
      >
        Retry
      </button>
    </div>
  );
}
