import { socket, connectSocket } from './socket';
import { createLogger, type TerminalJoinResponse } from '@omniscribe/shared';
import { PASTE_CHUNK_SIZE, PASTE_CHUNK_DELAY_MS } from './terminal-constants';

const logger = createLogger('TerminalAPI');

export interface TerminalOutputEvent {
  sessionId: number;
  data: string;
}

export interface TerminalClosedEvent {
  sessionId: number;
  exitCode: number;
  signal?: number;
}

export interface TerminalConnection {
  sessionId: number;
  onOutput: (data: string) => void;
  onClose: (exitCode: number, signal?: number) => void;
  cleanup: () => void;
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
    socket.emit(
      'terminal:spawn',
      { cwd, env },
      (response: { sessionId: number } | { error: string }) => {
        if ('error' in response) {
          logger.error('Spawn failed:', response.error);
          reject(new Error(response.error));
        } else {
          logger.info('Spawn success, sessionId:', response.sessionId);
          resolve(response.sessionId);
        }
      }
    );

    // Timeout after 10 seconds
    setTimeout(() => {
      logger.error('Terminal spawn timeout');
      reject(new Error('Terminal spawn timeout'));
    }, 10000);
  });
}

/**
 * Connect to a terminal session and set up event listeners
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
  const handleOutput = (event: TerminalOutputEvent) => {
    if (event.sessionId === sessionId) {
      onOutput(event.data);
    }
  };

  const handleClosed = (event: TerminalClosedEvent) => {
    if (event.sessionId === sessionId) {
      onClose(event.exitCode, event.signal);
    }
  };

  logger.debug('Connecting to terminal', sessionId);
  socket.on('terminal:output', handleOutput);
  socket.on('terminal:closed', handleClosed);

  const cleanup = () => {
    logger.debug('Cleaning up terminal connection', sessionId);
    socket.off('terminal:output', handleOutput);
    socket.off('terminal:closed', handleClosed);
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
  if (!socket.connected) {
    logger.warn('writeToTerminal: socket not connected, skipping');
    return;
  }

  socket.emit('terminal:input', { sessionId, data });
}

/**
 * Write data to a terminal session in chunks (for large pastes)
 * @param sessionId The session ID to write to
 * @param data The data to write
 */
export async function writeToTerminalChunked(sessionId: number, data: string): Promise<void> {
  if (!socket.connected) {
    logger.warn('writeToTerminalChunked: socket not connected, skipping');
    return;
  }

  if (data.length <= PASTE_CHUNK_SIZE) {
    socket.emit('terminal:input', { sessionId, data });
    return;
  }

  for (let i = 0; i < data.length; i += PASTE_CHUNK_SIZE) {
    const chunk = data.slice(i, i + PASTE_CHUNK_SIZE);
    socket.emit('terminal:input', { sessionId, data: chunk });

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
  if (!socket.connected) {
    logger.warn('resizeTerminal: socket not connected, skipping');
    return;
  }

  socket.emit('terminal:resize', { sessionId, cols, rows });
}

/**
 * Kill a terminal session
 * @param sessionId The session ID to kill
 */
export function killTerminal(sessionId: number): void {
  if (!socket.connected) {
    logger.warn('killTerminal: socket not connected, skipping');
    return;
  }

  socket.emit('terminal:kill', { sessionId });
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
    socket.emit('terminal:join', { sessionId }, (response: TerminalJoinResponse) => {
      resolve({ success: response.success, scrollback: response.scrollback });
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      resolve({ success: false });
    }, 5000);
  });
}
