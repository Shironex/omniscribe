import { socket } from './socket';
import { AiMode, UpdateSessionOptions, createLogger } from '@omniscribe/shared';
import { ExtendedSessionConfig } from '@/stores/useSessionStore';
import { emitWithErrorHandling, emitWithSuccessHandling } from './socketHelpers';

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
 * Response type for session creation/update
 */
interface SessionResponse {
  session?: ExtendedSessionConfig;
  error?: string;
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
  logger.info('Creating session', mode, projectPath, branch);
  const response = await emitWithErrorHandling<
    { mode: AiMode; projectPath: string; branch?: string } & CreateSessionOptions,
    SessionResponse
  >('session:create', {
    mode,
    projectPath,
    branch,
    ...options,
  });

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
