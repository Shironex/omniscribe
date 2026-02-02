import { socket, connectSocket } from './socket';
import { AiMode, UpdateSessionOptions } from '@omniscribe/shared';
import { ExtendedSessionConfig } from '../stores/useSessionStore';

/**
 * Ensure socket is connected before making requests
 */
async function ensureConnected(): Promise<void> {
  if (!socket.connected) {
    await connectSocket();
  }
}

/**
 * Create session options
 */
interface CreateSessionOptions {
  name?: string;
  workingDirectory?: string;
  model?: string;
  systemPrompt?: string;
  mcpServers?: string[];
}

/**
 * Create a new session
 */
export async function createSession(
  mode: AiMode,
  projectPath: string,
  branch?: string,
  options?: CreateSessionOptions
): Promise<ExtendedSessionConfig> {
  await ensureConnected();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Create session request timed out'));
    }, 10000);

    socket.emit(
      'session:create',
      {
        mode,
        projectPath,
        branch,
        ...options,
      },
      (response: ExtendedSessionConfig | { error: string }) => {
        clearTimeout(timeout);

        if ('error' in response) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Update an existing session
 */
export async function updateSession(
  sessionId: string,
  updates: UpdateSessionOptions
): Promise<ExtendedSessionConfig> {
  await ensureConnected();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Update session request timed out'));
    }, 10000);

    socket.emit(
      'session:update',
      {
        sessionId,
        updates,
      },
      (response: ExtendedSessionConfig | { error: string }) => {
        clearTimeout(timeout);

        if ('error' in response) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Remove a session
 */
export async function removeSession(sessionId: string): Promise<void> {
  await ensureConnected();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Remove session request timed out'));
    }, 10000);

    socket.emit(
      'session:remove',
      { sessionId },
      (response: { success: boolean; error?: string }) => {
        clearTimeout(timeout);

        if (!response.success) {
          reject(new Error(response.error ?? 'Failed to remove session'));
        } else {
          resolve();
        }
      }
    );
  });
}

/**
 * List sessions
 */
export async function listSessions(projectPath?: string): Promise<ExtendedSessionConfig[]> {
  await ensureConnected();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('List sessions request timed out'));
    }, 10000);

    socket.emit(
      'session:list',
      { projectPath },
      (response: ExtendedSessionConfig[] | { error: string }) => {
        clearTimeout(timeout);

        if ('error' in response) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

/**
 * Initialize session socket listeners
 * Should be called once when the app initializes
 */
export function initSessionListeners(
  onCreated: (session: ExtendedSessionConfig) => void,
  onStatus: (update: { sessionId: string; status: string; message?: string; needsInputPrompt?: boolean }) => void,
  onRemoved: (payload: { sessionId: string }) => void
): () => void {
  socket.on('session:created', onCreated);
  socket.on('session:status', onStatus);
  socket.on('session:removed', onRemoved);

  // Return cleanup function
  return () => {
    socket.off('session:created', onCreated);
    socket.off('session:status', onStatus);
    socket.off('session:removed', onRemoved);
  };
}
