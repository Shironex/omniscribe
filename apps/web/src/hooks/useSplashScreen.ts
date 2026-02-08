import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { getPersistedTheme, isPersistedThemeDark } from '@/lib/theme-persistence';
import { useAppVersion } from './useAppVersion';

/** Minimum time the splash screen stays visible (ms) */
const MIN_DISPLAY_MS = 1500;
/** Maximum time before force-dismissing the splash screen (ms) */
const MAX_DISPLAY_MS = 10_000;
/** Delay before showing the spinner (ms) */
const SPINNER_DELAY_MS = 500;
/** Duration of the fade-out exit animation (ms) */
const EXIT_ANIMATION_MS = 500;

export interface SplashScreenState {
  /** Whether the splash screen should be in the DOM */
  isVisible: boolean;
  /** Whether the fade-out exit animation is in progress */
  isDismissing: boolean;
  /** Whether the spinner should be shown (delayed appearance) */
  showSpinner: boolean;
  /** Current loading status text */
  statusText: string;
  /** App version string (empty in dev mode) */
  version: string;
  /** Whether the current persisted theme is dark */
  isDarkTheme: boolean;
}

/**
 * Aggregates readiness signals and timing logic for the splash screen.
 *
 * Readiness requires:
 * - WebSocket connection established (connectionStore.status === 'connected')
 * - Workspace state restored from backend (workspaceStore.isRestored)
 * - Minimum display time elapsed (1.5s)
 *
 * Safety: force-dismisses after 10s with a warning toast.
 */
export function useSplashScreen(): SplashScreenState {
  const connectionStatus = useConnectionStore(state => state.status);
  const isWorkspaceRestored = useWorkspaceStore(state => state.isRestored);

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [maxTimeReached, setMaxTimeReached] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const version = useAppVersion();
  const [isDarkTheme] = useState(() => isPersistedThemeDark(getPersistedTheme()));

  const hasDismissedRef = useRef(false);

  // Derived readiness
  const isAppReady = connectionStatus === 'connected' && isWorkspaceRestored;
  const shouldDismiss = (isAppReady && minTimeElapsed) || maxTimeReached;

  // Minimum display timer (1.5s)
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Maximum display timer (10s safety)
  useEffect(() => {
    const timer = setTimeout(() => setMaxTimeReached(true), MAX_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Spinner delay (500ms)
  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss effect: start exit animation, then remove from DOM
  useEffect(() => {
    if (!shouldDismiss || hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    setIsDismissing(true);

    const timer = setTimeout(() => setIsVisible(false), EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [shouldDismiss]);

  // Max timeout warning toast
  useEffect(() => {
    if (maxTimeReached && !isAppReady) {
      toast.warning(
        'Some services are still connecting. The app may take a moment to fully load.',
        { duration: 5000 }
      );
    }
  }, [maxTimeReached, isAppReady]);

  // Status text based on current readiness signals
  const statusText = deriveStatusText(connectionStatus, isWorkspaceRestored);

  return { isVisible, isDismissing, showSpinner, statusText, version, isDarkTheme };
}

/**
 * Derive human-readable status text from the current readiness signals.
 */
function deriveStatusText(connectionStatus: string, isWorkspaceRestored: boolean): string {
  if (connectionStatus !== 'connected') {
    switch (connectionStatus) {
      case 'reconnecting':
        return 'Connecting...';
      case 'failed':
        return 'Connection failed. Retrying...';
      default:
        return 'Initializing...';
    }
  }
  if (!isWorkspaceRestored) {
    return 'Loading workspace...';
  }
  return 'Almost ready';
}
