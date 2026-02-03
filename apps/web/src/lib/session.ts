import { socket } from './socket';
import { AiMode, UpdateSessionOptions } from '@omniscribe/shared';
import { ExtendedSessionConfig } from '../stores/useSessionStore';
import { emitWithErrorHandling, emitWithSuccessHandling } from './socketHelpers';

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
  return emitWithErrorHandling<
    { mode: AiMode; projectPath: string; branch?: string } & CreateSessionOptions,
    ExtendedSessionConfig
  >('session:create', {
    mode,
    projectPath,
    branch,
    ...options,
  });
}

/**
 * Update an existing session
 */
export async function updateSession(
  sessionId: string,
  updates: UpdateSessionOptions
): Promise<ExtendedSessionConfig> {
  return emitWithErrorHandling<
    { sessionId: string; updates: UpdateSessionOptions },
    ExtendedSessionConfig
  >('session:update', {
    sessionId,
    updates,
  });
}

/**
 * Remove a session
 */
export async function removeSession(sessionId: string): Promise<void> {
  return emitWithSuccessHandling(
    'session:remove',
    { sessionId },
    {},
    'Failed to remove session'
  );
}

/**
 * List sessions
 */
export async function listSessions(projectPath?: string): Promise<ExtendedSessionConfig[]> {
  return emitWithErrorHandling<
    { projectPath?: string },
    ExtendedSessionConfig[]
  >('session:list', { projectPath });
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
