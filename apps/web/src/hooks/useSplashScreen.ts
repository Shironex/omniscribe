import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useAppVersion } from './useAppVersion';

/** Minimum time the splash screen stays visible (ms) */
const MIN_DISPLAY_MS = 2000;
/** Maximum time before force-dismissing the splash screen (ms) */
const MAX_DISPLAY_MS = 10_000;
/** Delay before showing the spinner / footer status (ms) */
const SPINNER_DELAY_MS = 500;
/** Duration of the fade-out exit animation (ms) */
const EXIT_ANIMATION_MS = 500;

/**
 * Per-step minimum dwell time (ms from mount) before the row is allowed to
 * flip to `done`. Each row also picks up `running` when the previous one
 * has reached its dwell threshold — so on instant cold starts the user
 * still sees `wait → running → done` choreography play out across the rows
 * instead of all three flipping to done on the first frame. Real readiness
 * signals are still authoritative: a slow backend keeps the row in
 * `running` past its dwell threshold until the real signal fires.
 */
const STEP_DWELL_MS = {
  backend: 600,
  socket: 1100,
  workspace: 1700,
} as const;

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
  // Step dwell phase: 0 before backend dwell, 1 after it, 2 after socket
  // dwell, 3 after workspace dwell. Combined with real signals to derive
  // the per-row status so the choreography is always visible.
  const [stepPhase, setStepPhase] = useState(0);
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

  // Step-dwell phase ticker — schedules three transitions so each boot-trace
  // row gets visible airtime even on instant cold starts.
  useEffect(() => {
    const t1 = setTimeout(() => setStepPhase(p => Math.max(p, 1)), STEP_DWELL_MS.backend);
    const t2 = setTimeout(() => setStepPhase(p => Math.max(p, 2)), STEP_DWELL_MS.socket);
    const t3 = setTimeout(() => setStepPhase(p => Math.max(p, 3)), STEP_DWELL_MS.workspace);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
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
  const steps = deriveSteps(connectionStatus, isWorkspaceRestored, isConnectionFailed, stepPhase);
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
 * Map real readiness signals + the dwell phase into the boot-trace step list.
 *
 * `stepPhase` is a 0..3 counter advanced by per-step dwell timers in the
 * hook. It establishes the *minimum* visible animation pacing — each row
 * gets at least its dwell time as `running` before flipping to `done`.
 * Real readiness signals can extend a row past its dwell (slow backends
 * stay `running`) but cannot skip the dwell (instant cold starts still
 * see the full choreography).
 *
 * - `backend`   — `running` from frame 0; `done` only when phase >= 1
 *                 AND the socket has actually connected.
 * - `socket`    — `wait` while phase < 1; `running` once the prior row's
 *                 dwell has elapsed (or `connectionStatus === 'reconnecting'`,
 *                 whichever is first); `done` only when phase >= 2 AND
 *                 the socket is connected.
 * - `workspace` — `wait` while phase < 2; `running` after the socket row
 *                 reaches done; `done` only when phase >= 3 AND the
 *                 workspace store has restored.
 *
 * Any failed connection collapses the affected rows into `error`
 * immediately — error always trumps dwell.
 */
function deriveSteps(
  connectionStatus: string,
  isWorkspaceRestored: boolean,
  isConnectionFailed: boolean,
  stepPhase: number
): SplashStep[] {
  const isConnected = connectionStatus === 'connected';
  const isReconnecting = connectionStatus === 'reconnecting';

  // Backend: starts running immediately, requires phase >= 1 AND a real
  // connection to flip to done.
  const backendStatus: SplashStepStatus = isConnectionFailed
    ? 'error'
    : isConnected && stepPhase >= 1
      ? 'done'
      : 'running';

  // Socket: waits for backend to dwell, then runs, then dones once
  // phase >= 2 AND really connected.
  let socketStatus: SplashStepStatus;
  if (isConnectionFailed) {
    socketStatus = 'error';
  } else if (isConnected && stepPhase >= 2) {
    socketStatus = 'done';
  } else if (stepPhase >= 1 || isReconnecting) {
    socketStatus = 'running';
  } else {
    socketStatus = 'wait';
  }

  // Workspace: waits for socket to dwell, then runs, then dones once
  // phase >= 3 AND really restored.
  let workspaceStatus: SplashStepStatus;
  if (stepPhase < 2) {
    workspaceStatus = 'wait';
  } else if (isWorkspaceRestored && stepPhase >= 3) {
    workspaceStatus = 'done';
  } else {
    workspaceStatus = 'running';
  }

  return [
    { id: 'backend', label: 'spinning up backend', status: backendStatus },
    { id: 'socket', label: 'connecting to socket', status: socketStatus },
    { id: 'workspace', label: 'restoring workspace', status: workspaceStatus },
  ];
}
