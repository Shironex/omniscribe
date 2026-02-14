import {
  AiMode,
  UpdateSessionOptions,
  createLogger,
  SessionEvents,
  ResumeSessionPayload,
  ForkSessionPayload,
  ContinueLastSessionPayload,
} from '@omniscribe/shared';
import type { FrontendSessionConfig } from '@/stores/useSessionStore';
import { emitAsync, emitWithErrorHandling, emitWithSuccessHandling } from './socketHelpers';
import { toast } from 'sonner';

const logger = createLogger('SessionAPI');

/**
 * Validate a session response and return the session, or throw on error.
 */
function handleSessionResponse(
  response: CreateSessionResponse,
  operationName: string
): FrontendSessionConfig {
  if (response.error) {
    logger.warn(`Session ${operationName} rejected:`, response.error);
    throw new Error(response.error);
  }
  if (!response.session) {
    logger.error('No session returned from server');
    throw new Error('No session returned from server');
  }
  // Show worktree warning to user if present
  if (response.warning) {
    logger.warn(`Session ${operationName} warning:`, response.warning);
    toast.warning(response.warning);
  }
  return response.session;
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
 * Response type for session creation (includes limit response fields)
 */
interface CreateSessionResponse {
  session?: FrontendSessionConfig;
  error?: string;
  warning?: string;
  idleSessions?: string[];
}

/**
 * Response type for session update
 */
interface SessionResponse {
  session?: FrontendSessionConfig;
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
): Promise<FrontendSessionConfig> {
  logger.info('Creating session', mode, projectPath, branch);

  // Use emitAsync directly to handle the limit response with idleSessions
  const response = await emitAsync<
    { mode: AiMode; projectPath: string; branch?: string } & CreateSessionOptions,
    CreateSessionResponse
  >(SessionEvents.CREATE, {
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

  // Show worktree warning to user if present
  if (response.warning) {
    logger.warn('Session creation warning:', response.warning);
    toast.warning(response.warning);
  }

  return response.session;
}

/**
 * Update an existing session
 */
export async function updateSession(
  sessionId: string,
  updates: UpdateSessionOptions
): Promise<FrontendSessionConfig> {
  logger.debug('Updating session', sessionId);
  const response = await emitWithErrorHandling<
    { sessionId: string; updates: UpdateSessionOptions },
    SessionResponse
  >(SessionEvents.UPDATE, {
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
  return emitWithSuccessHandling(
    SessionEvents.REMOVE,
    { sessionId },
    {},
    'Failed to remove session'
  );
}

/**
 * List sessions
 */
export async function listSessions(projectPath?: string): Promise<FrontendSessionConfig[]> {
  logger.debug('Listing sessions', projectPath);
  return emitWithErrorHandling<{ projectPath?: string }, FrontendSessionConfig[]>(
    SessionEvents.LIST,
    {
      projectPath,
    }
  );
}

/**
 * Resume a Claude Code session
 */
export async function resumeSession(
  claudeSessionId: string,
  projectPath: string,
  branch?: string,
  name?: string
): Promise<FrontendSessionConfig> {
  logger.info('Resuming Claude session', claudeSessionId, projectPath);
  const response = await emitAsync<ResumeSessionPayload, CreateSessionResponse>(
    SessionEvents.RESUME,
    {
      claudeSessionId,
      projectPath,
      branch,
      name,
    }
  );

  return handleSessionResponse(response, 'resume');
}

/**
 * Fork a Claude Code session (creates a conversation branch)
 */
export async function forkSession(
  claudeSessionId: string,
  projectPath: string,
  branch?: string,
  name?: string
): Promise<FrontendSessionConfig> {
  logger.info('Forking Claude session', claudeSessionId, projectPath);
  const response = await emitAsync<ForkSessionPayload, CreateSessionResponse>(SessionEvents.FORK, {
    claudeSessionId,
    projectPath,
    branch,
    name,
  });

  return handleSessionResponse(response, 'fork');
}

/**
 * Continue the most recent Claude Code session in a project
 */
export async function continueLastSession(
  projectPath: string,
  branch?: string,
  name?: string
): Promise<FrontendSessionConfig> {
  logger.info('Continuing last Claude session', projectPath);
  const response = await emitAsync<ContinueLastSessionPayload, CreateSessionResponse>(
    SessionEvents.CONTINUE_LAST,
    { projectPath, branch, name }
  );

  return handleSessionResponse(response, 'continue last');
}
