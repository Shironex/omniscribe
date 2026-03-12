import { getSocket, connectSocket } from './socket';
import {
  createLogger,
  TerminalEvents,
  type TerminalJoinResponse,
  type TerminalOutputEvent,
  type TerminalClosedEvent,
} from '@omniscribe/shared';
import { PASTE_CHUNK_SIZE, PASTE_CHUNK_DELAY_MS } from './terminal-constants';

const logger = createLogger('TerminalAPI');

export type { TerminalOutputEvent, TerminalClosedEvent };

export interface TerminalConnection {
  sessionId: number;
  onOutput: (data: string) => void;
  onClose: (exitCode: number, signal?: number) => void;
  cleanup: () => void;
}

// ---------------------------------------------------------------------------
// Map-based dispatcher for terminal output/close events.
//
// Instead of each terminal subscribing its own handler to the global
// `terminal:output` / `terminal:closed` socket events (O(N) filtering per
// event), we keep a single global listener per event type that routes to the
// correct callback via a sessionId -> callback Map.  This reduces per-event
// work from O(N) to O(1).
//
// TODO: An even better approach would be per-session socket event names
// (e.g. `terminal:output:${sessionId}`) emitted by the backend, which would
// let Socket.io handle the routing natively.  That requires backend changes.
// ---------------------------------------------------------------------------

type OutputCallback = (data: string) => void;
type CloseCallback = (exitCode: number, signal?: number) => void;

const outputHandlers = new Map<number, OutputCallback>();
const closeHandlers = new Map<number, CloseCallback>();

let globalListenersAttached = false;

/** Reset global dispatcher state. Exposed for testing only. */
export function __resetTerminalDispatcher() {
  globalListenersAttached = false;
  outputHandlers.clear();
  closeHandlers.clear();
}

function ensureGlobalListeners() {
  if (globalListenersAttached) return;
  globalListenersAttached = true;

  getSocket().on(TerminalEvents.OUTPUT, (event: TerminalOutputEvent) => {
    const handler = outputHandlers.get(event.sessionId);
    if (handler) handler(event.data);
  });

  getSocket().on(TerminalEvents.CLOSED, (event: TerminalClosedEvent) => {
    const handler = closeHandlers.get(event.sessionId);
    if (handler) handler(event.exitCode, event.signal);
  });
}

/**
 * Spawn a new terminal session
 * @param cwd Working directory for the terminal
 * @param env Environment variables to pass to the terminal
 * @returns Promise resolving to the session ID
 */
export async function spawnTerminal(cwd?: string, env?: Record<string, string>): Promise<number> {
  await connectSocket();

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        logger.error('Terminal spawn timeout');
        reject(new Error('Terminal spawn timeout'));
      }
    }, 10000);

    getSocket().emit(
      TerminalEvents.SPAWN,
      { cwd, env },
      (response: { sessionId: number } | { error: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if ('error' in response) {
          logger.error('Spawn failed:', response.error);
          reject(new Error(response.error));
        } else {
          logger.info('Spawn success, sessionId:', response.sessionId);
          resolve(response.sessionId);
        }
      }
    );
  });
}

/**
 * Connect to a terminal session and set up event listeners.
 *
 * Uses a global Map-based dispatcher so that each `terminal:output` event is
 * routed in O(1) rather than being checked by every connected terminal.
 *
 * @param sessionId The session ID to connect to
 * @param onOutput Callback for terminal output
 * @param onClose Callback for terminal close
 * @returns TerminalConnection object with cleanup function
 */
export function connectTerminal(
  sessionId: number,
  onOutput: (data: string) => void,
  onClose: (exitCode: number, signal?: number) => void
): TerminalConnection {
  logger.debug('Connecting to terminal', sessionId);

  ensureGlobalListeners();
  outputHandlers.set(sessionId, onOutput);
  closeHandlers.set(sessionId, onClose);

  const cleanup = () => {
    logger.debug('Cleaning up terminal connection', sessionId);
    outputHandlers.delete(sessionId);
    closeHandlers.delete(sessionId);
  };

  return {
    sessionId,
    onOutput,
    onClose,
    cleanup,
  };
}

/**
 * Write data to a terminal session
 * @param sessionId The session ID to write to
 * @param data The data to write
 */
export function writeToTerminal(sessionId: number, data: string): void {
  if (!getSocket().connected) {
    logger.warn('writeToTerminal: socket not connected, skipping');
    return;
  }

  getSocket().emit(TerminalEvents.INPUT, { sessionId, data });
}

/**
 * Write data to a terminal session in chunks (for large pastes)
 * @param sessionId The session ID to write to
 * @param data The data to write
 */
export async function writeToTerminalChunked(sessionId: number, data: string): Promise<void> {
  if (!getSocket().connected) {
    logger.warn('writeToTerminalChunked: socket not connected, skipping');
    return;
  }

  if (data.length <= PASTE_CHUNK_SIZE) {
    getSocket().emit(TerminalEvents.INPUT, { sessionId, data });
    return;
  }

  for (let i = 0; i < data.length; i += PASTE_CHUNK_SIZE) {
    const chunk = data.slice(i, i + PASTE_CHUNK_SIZE);
    getSocket().emit(TerminalEvents.INPUT, { sessionId, data: chunk });

    if (i + PASTE_CHUNK_SIZE < data.length) {
      await new Promise(resolve => setTimeout(resolve, PASTE_CHUNK_DELAY_MS));
    }
  }
}

/**
 * Resize a terminal session
 * @param sessionId The session ID to resize
 * @param cols Number of columns
 * @param rows Number of rows
 */
export function resizeTerminal(sessionId: number, cols: number, rows: number): void {
  if (!getSocket().connected) {
    logger.warn('resizeTerminal: socket not connected, skipping');
    return;
  }

  getSocket().emit(TerminalEvents.RESIZE, { sessionId, cols, rows });
}

/**
 * Kill a terminal session
 * @param sessionId The session ID to kill
 */
export function killTerminal(sessionId: number): void {
  if (!getSocket().connected) {
    logger.warn('killTerminal: socket not connected, skipping');
    return;
  }

  getSocket().emit(TerminalEvents.KILL, { sessionId });
}

/**
 * Join an existing terminal session
 * @param sessionId The session ID to join
 * @returns Promise resolving to join response with optional scrollback data
 */
export async function joinTerminal(
  sessionId: number
): Promise<{ success: boolean; scrollback?: string }> {
  await connectSocket();

  logger.debug('Joining terminal', sessionId);
  return new Promise(resolve => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ success: false });
      }
    }, 5000);

    getSocket().emit(TerminalEvents.JOIN, { sessionId }, (response: TerminalJoinResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve({ success: response.success, scrollback: response.scrollback });
    });
  });
}
