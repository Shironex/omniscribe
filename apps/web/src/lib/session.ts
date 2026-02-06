import { socket } from './socket';
import { AiMode, UpdateSessionOptions, createLogger } from '@omniscribe/shared';
import { ExtendedSessionConfig } from '@/stores/useSessionStore';
import { emitAsync, emitWithErrorHandling, emitWithSuccessHandling } from './socketHelpers';

const logger = createLogger('SessionAPI');

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
 * Response type for session creation (includes limit response fields)
 */
interface CreateSessionResponse {
  session?: ExtendedSessionConfig;
  error?: string;
  idleSessions?: string[];
}

/**
 * Response type for session update
 */
interface SessionResponse {
  session?: ExtendedSessionConfig;
  error?: string;
}

/**
 * Create a new session.
 * When the server rejects due to session limit, the error message includes
 * the names of idle sessions the user could close.
 */
export async function createSession(
  mode: AiMode,
  projectPath: string,
  branch?: string,
  options?: CreateSessionOptions
): Promise<ExtendedSessionConfig> {
  logger.info('Creating session', mode, projectPath, branch);

  // Use emitAsync directly to handle the limit response with idleSessions
  const response = await emitAsync<
    { mode: AiMode; projectPath: string; branch?: string } & CreateSessionOptions,
    CreateSessionResponse
  >('session:create', {
    mode,
    projectPath,
    branch,
    ...options,
  });

  if (response.error) {
    // Include idle session names in the error for the toast
    const idleHint =
      response.idleSessions && response.idleSessions.length > 0
        ? `\nIdle sessions you could close: ${response.idleSessions.join(', ')}`
        : '';
    logger.warn('Session creation rejected:', response.error);
    throw new Error(response.error + idleHint);
  }

  if (!response.session) {
    logger.error('No session returned from server');
    throw new Error('No session returned from server');
  }

  return response.session;
}

/**
 * Update an existing session
 */
export async function updateSession(
  sessionId: string,
  updates: UpdateSessionOptions
): Promise<ExtendedSessionConfig> {
  logger.debug('Updating session', sessionId);
  const response = await emitWithErrorHandling<
    { sessionId: string; updates: UpdateSessionOptions },
    SessionResponse
  >('session:update', {
    sessionId,
    updates,
  });

  if (!response.session) {
    logger.error('No session returned from server after update', sessionId);
    throw new Error('No session returned from server');
  }

  return response.session;
}

/**
 * Remove a session
 */
export async function removeSession(sessionId: string): Promise<void> {
  logger.info('Removing session', sessionId);
  return emitWithSuccessHandling('session:remove', { sessionId }, {}, 'Failed to remove session');
}

/**
 * List sessions
 */
export async function listSessions(projectPath?: string): Promise<ExtendedSessionConfig[]> {
  logger.debug('Listing sessions', projectPath);
  return emitWithErrorHandling<{ projectPath?: string }, ExtendedSessionConfig[]>('session:list', {
    projectPath,
  });
}

/**
 * Initialize session socket listeners
 * Should be called once when the app initializes
 */
export function initSessionListeners(
  onCreated: (session: ExtendedSessionConfig) => void,
  onStatus: (update: {
    sessionId: string;
    status: string;
    message?: string;
    needsInputPrompt?: boolean;
  }) => void,
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
