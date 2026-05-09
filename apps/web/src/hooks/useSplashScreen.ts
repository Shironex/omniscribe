import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useAppVersion } from './useAppVersion';

/** Minimum time the splash screen stays visible (ms) */
const MIN_DISPLAY_MS = 1200;
/** Maximum time before force-dismissing the splash screen (ms) */
const MAX_DISPLAY_MS = 10_000;
/** Delay before showing the spinner / footer status (ms) */
const SPINNER_DELAY_MS = 500;
/** Duration of the fade-out exit animation (ms) */
const EXIT_ANIMATION_MS = 500;

/**
 * Boot-trace step descriptor.
 *
 * The splash exposes three real readiness signals in order:
 *   1. `backend`    — NestJS bootstrap (proxied via the WebSocket lifecycle —
 *                     "running" while the connection is establishing,
 *                     "done" once it transitions to `connected`).
 *   2. `socket`     — Socket.io transport handshake (same `connectionStatus`
 *                     signal, separated for narrative clarity).
 *   3. `workspace`  — `useWorkspaceStore.isRestored` flips true once the
 *                     server replies with the persisted workspace tree.
 *
 * Note on the dropped MCP step: the original design proposal listed an
 * optional 4th row for MCP capability polling. We measured the typical
 * first-payload timing during dev iteration — `mcp:status` events fire
 * after the workspace is already restored and the app is interactive,
 * so a "polling MCP capabilities" row would (a) usually still be running
 * after the splash should already be gone, and (b) tie splash visibility
 * to a non-blocking step. Dropped it for honesty.
 */
export type SplashStepId = 'backend' | 'socket' | 'workspace';

export type SplashStepStatus = 'wait' | 'running' | 'done' | 'error';

export interface SplashStep {
  /** Stable identifier — drives keys + aria-current row selection */
  id: SplashStepId;
  /** Plain-text label rendered into the row */
  label: string;
  /** Computed status based on real readiness signals */
  status: SplashStepStatus;
}

export type SplashVariant = 'loading' | 'updating' | 'error';

export interface SplashScreenState {
  /** Whether the splash screen should be in the DOM */
  isVisible: boolean;
  /** Whether the fade-out exit animation is in progress */
  isDismissing: boolean;
  /** Whether the spinner / footer status row should be shown */
  showSpinner: boolean;
  /** Current loading status text (legacy single-line summary) */
  statusText: string;
  /** App version string (empty in dev mode) */
  version: string;
  /** Active variant — drives the visual branch */
  variant: SplashVariant;
  /** Boot-trace step list — ordered, status-flipped from real signals */
  steps: SplashStep[];
  /** Underlying connection error string when variant === 'error' */
  error: string | null;
}

/**
 * Aggregates readiness signals and timing logic for the splash screen.
 *
 * Readiness requires:
 * - WebSocket connection established (connectionStore.status === 'connected')
 * - Workspace state restored from backend (workspaceStore.isRestored)
 * - Minimum display time elapsed (1.2s)
 *
 * Safety: force-dismisses after 10s with a warning toast and surfaces an
 * `error` variant if the connection is still failing at that point.
 */
export function useSplashScreen(): SplashScreenState {
  const connectionStatus = useConnectionStore(state => state.status);
  const isWorkspaceRestored = useWorkspaceStore(state => state.isRestored);
  const updateStatus = useUpdateStore(state => state.status);

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [maxTimeReached, setMaxTimeReached] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const version = useAppVersion();

  const hasDismissedRef = useRef(false);

  // Derived readiness
  const isAppReady = connectionStatus === 'connected' && isWorkspaceRestored;

  // Variant selection
  // - 'updating': auto-updater is actively downloading or ready to install.
  //   Stays up — the renderer is about to be torn down by the installer.
  // - 'error':   connection has failed OR we hit the max-display safety net
  //              while still not connected. Surfaces Retry/Close.
  // - 'loading': default.
  const isInstalling = updateStatus === 'downloading' || updateStatus === 'ready';
  const isConnectionFailed = connectionStatus === 'failed';
  const isStuck = maxTimeReached && !isAppReady;
  const variant: SplashVariant = isInstalling
    ? 'updating'
    : isConnectionFailed || isStuck
      ? 'error'
      : 'loading';

  // The 'updating' variant never auto-dismisses — it waits for the installer
  // to actually exit the renderer. The 'error' variant also stays up so the
  // user can read the failure and choose Retry / Close.
  const shouldDismiss = variant === 'loading' && ((isAppReady && minTimeElapsed) || maxTimeReached);

  // Minimum display timer
  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Maximum display timer (safety)
  useEffect(() => {
    const timer = setTimeout(() => setMaxTimeReached(true), MAX_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Spinner / footer fade-in delay
  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Dismiss effect
  useEffect(() => {
    if (!shouldDismiss || hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    setIsDismissing(true);

    const timer = setTimeout(() => setIsVisible(false), EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [shouldDismiss]);

  // Max timeout warning toast — only surface when the safety net trips
  // AND we're not in a variant that already explains the problem visually.
  useEffect(() => {
    if (maxTimeReached && !isAppReady && variant !== 'error') {
      toast.warning(
        'Some services are still connecting. The app may take a moment to fully load.',
        { duration: 5000 }
      );
    }
  }, [maxTimeReached, isAppReady, variant]);

  const statusText = deriveStatusText(connectionStatus, isWorkspaceRestored);
  const steps = deriveSteps(connectionStatus, isWorkspaceRestored, isConnectionFailed);
  const error = isConnectionFailed
    ? 'Backend connection failed. The orchestrator could not reach its WebSocket.'
    : isStuck
      ? 'Initialization is taking longer than expected. Some services may be unreachable.'
      : null;

  return {
    isVisible,
    isDismissing,
    showSpinner,
    statusText,
    version,
    variant,
    steps,
    error,
  };
}

/**
 * Derive human-readable status text from the current readiness signals.
 * Kept for backward compatibility with the legacy splash + tests.
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

/**
 * Map real readiness signals into the boot-trace step list.
 *
 * Step semantics:
 * - `backend`   — `running` until socket connects, then `done`. We use the
 *                 socket transition as the proxy for "Nest is up + accepting"
 *                 because that's the externally-observable signal we have.
 * - `socket`    — `wait` while backend is starting; `running` while we're
 *                 negotiating; `done` once `connected`. Splits the narrative
 *                 from `backend` so the user sees two distinct phases on
 *                 cold starts that take a moment.
 * - `workspace` — `wait` until socket is up; `running` until restored;
 *                 `done` once `isRestored` flips.
 * Any failed connection collapses the active row into `error`.
 */
function deriveSteps(
  connectionStatus: string,
  isWorkspaceRestored: boolean,
  isConnectionFailed: boolean
): SplashStep[] {
  const isConnected = connectionStatus === 'connected';

  // Backend: we treat the very first "reconnecting" tick as backend start-up.
  // Once the socket flips to connected, backend is done.
  const backendStatus: SplashStepStatus = isConnectionFailed
    ? 'error'
    : isConnected
      ? 'done'
      : 'running';

  // Socket: only meaningfully "running" once backend has had a chance to
  // come up. We intentionally collapse the early "Initializing..." phase
  // into the backend row — otherwise both rows would say running at the
  // same time on the first frame and it would look fake.
  let socketStatus: SplashStepStatus;
  if (isConnectionFailed) {
    socketStatus = 'error';
  } else if (isConnected) {
    socketStatus = 'done';
  } else if (connectionStatus === 'reconnecting') {
    socketStatus = 'running';
  } else {
    socketStatus = 'wait';
  }

  let workspaceStatus: SplashStepStatus;
  if (!isConnected) {
    workspaceStatus = 'wait';
  } else if (!isWorkspaceRestored) {
    workspaceStatus = 'running';
  } else {
    workspaceStatus = 'done';
  }

  return [
    { id: 'backend', label: 'spinning up backend', status: backendStatus },
    { id: 'socket', label: 'connecting to socket', status: socketStatus },
    { id: 'workspace', label: 'restoring workspace', status: workspaceStatus },
  ];
}
