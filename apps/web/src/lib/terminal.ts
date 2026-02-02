import { socket, connectSocket } from './socket';

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
export async function spawnTerminal(
  cwd?: string,
  env?: Record<string, string>,
): Promise<number> {
  await connectSocket();

  return new Promise((resolve, reject) => {
    socket.emit(
      'terminal:spawn',
      { cwd, env },
      (response: { sessionId: number } | { error: string }) => {
        if ('error' in response) {
          reject(new Error(response.error));
        } else {
          resolve(response.sessionId);
        }
      },
    );

    // Timeout after 10 seconds
    setTimeout(() => {
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
  onClose: (exitCode: number, signal?: number) => void,
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

  socket.on('terminal:output', handleOutput);
  socket.on('terminal:closed', handleClosed);

  const cleanup = () => {
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
    console.warn('[Terminal] Cannot write: socket not connected');
    return;
  }

  socket.emit('terminal:input', { sessionId, data });
}

/**
 * Resize a terminal session
 * @param sessionId The session ID to resize
 * @param cols Number of columns
 * @param rows Number of rows
 */
export function resizeTerminal(
  sessionId: number,
  cols: number,
  rows: number,
): void {
  if (!socket.connected) {
    console.warn('[Terminal] Cannot resize: socket not connected');
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
    console.warn('[Terminal] Cannot kill: socket not connected');
    return;
  }

  socket.emit('terminal:kill', { sessionId });
}

/**
 * Join an existing terminal session
 * @param sessionId The session ID to join
 * @returns Promise resolving to success status
 */
export async function joinTerminal(sessionId: number): Promise<boolean> {
  await connectSocket();

  return new Promise((resolve) => {
    socket.emit(
      'terminal:join',
      { sessionId },
      (response: { success: boolean }) => {
        resolve(response.success);
      },
    );

    // Timeout after 5 seconds
    setTimeout(() => {
      resolve(false);
    }, 5000);
  });
}
