import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionEvents } from '@omniscribe/shared';

// Mock socketHelpers
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: vi.fn(),
  emitWithErrorHandling: vi.fn(),
  emitWithSuccessHandling: vi.fn(),
}));

// Mock the socket module (session.ts imports FrontendSessionConfig type from store,
// but the actual socket re-exports are in socketHelpers which we mock above)
vi.mock('@/lib/socket', () => ({
  socket: { connected: true, emit: vi.fn(), on: vi.fn(), off: vi.fn() },
  connectSocket: vi.fn(),
  default: { connected: true, emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

import {
  createSession,
  updateSession,
  removeSession,
  listSessions,
  resumeSession,
  forkSession,
  continueLastSession,
} from '../session';
import { emitAsync, emitWithErrorHandling, emitWithSuccessHandling } from '@/lib/socketHelpers';

const mockEmitAsync = vi.mocked(emitAsync);
const mockEmitWithErrorHandling = vi.mocked(emitWithErrorHandling);
const mockEmitWithSuccessHandling = vi.mocked(emitWithSuccessHandling);

const mockSession = {
  id: 'sess-1',
  name: 'Test Session',
  workingDirectory: '/test',
  aiMode: 'claude' as const,
  projectPath: '/test',
  status: 'idle' as const,
  createdAt: new Date(),
  lastActiveAt: new Date(),
};

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitAsync with SessionEvents.CREATE and returns the session', async () => {
    mockEmitAsync.mockResolvedValue({ session: mockSession });

    const result = await createSession('claude', '/test', 'main');

    expect(mockEmitAsync).toHaveBeenCalledWith(
      SessionEvents.CREATE,
      expect.objectContaining({
        mode: 'claude',
        projectPath: '/test',
        branch: 'main',
      })
    );
    expect(result).toEqual(mockSession);
  });

  it('includes optional CreateSessionOptions in the payload', async () => {
    mockEmitAsync.mockResolvedValue({ session: mockSession });

    await createSession('claude', '/test', 'main', {
      name: 'Custom',
      model: 'opus',
      systemPrompt: 'Be concise',
      mcpServers: ['server1'],
    });

    expect(mockEmitAsync).toHaveBeenCalledWith(
      SessionEvents.CREATE,
      expect.objectContaining({
        mode: 'claude',
        projectPath: '/test',
        branch: 'main',
        name: 'Custom',
        model: 'opus',
        systemPrompt: 'Be concise',
        mcpServers: ['server1'],
      })
    );
  });

  it('throws when server returns an error response', async () => {
    mockEmitAsync.mockResolvedValue({ error: 'Session limit reached' });

    await expect(createSession('claude', '/test')).rejects.toThrow('Session limit reached');
  });

  it('includes idle session names in error when present', async () => {
    mockEmitAsync.mockResolvedValue({
      error: 'Session limit reached',
      idleSessions: ['Session A', 'Session B'],
    });

    await expect(createSession('claude', '/test')).rejects.toThrow(
      'Idle sessions you could close: Session A, Session B'
    );
  });

  it('throws when no session is returned', async () => {
    mockEmitAsync.mockResolvedValue({});

    await expect(createSession('claude', '/test')).rejects.toThrow(
      'No session returned from server'
    );
  });
});

describe('updateSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitWithErrorHandling with SessionEvents.UPDATE', async () => {
    mockEmitWithErrorHandling.mockResolvedValue({ session: mockSession });

    const result = await updateSession('sess-1', { name: 'Updated' });

    expect(mockEmitWithErrorHandling).toHaveBeenCalledWith(SessionEvents.UPDATE, {
      sessionId: 'sess-1',
      updates: { name: 'Updated' },
    });
    expect(result).toEqual(mockSession);
  });

  it('throws when no session is in the response', async () => {
    mockEmitWithErrorHandling.mockResolvedValue({});

    await expect(updateSession('sess-1', { name: 'Updated' })).rejects.toThrow(
      'No session returned from server'
    );
  });
});

describe('removeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitWithSuccessHandling with SessionEvents.REMOVE', async () => {
    mockEmitWithSuccessHandling.mockResolvedValue(undefined);

    await removeSession('sess-1');

    expect(mockEmitWithSuccessHandling).toHaveBeenCalledWith(
      SessionEvents.REMOVE,
      { sessionId: 'sess-1' },
      {},
      'Failed to remove session'
    );
  });
});

describe('listSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitWithErrorHandling with SessionEvents.LIST', async () => {
    mockEmitWithErrorHandling.mockResolvedValue([mockSession]);

    const result = await listSessions('/test');

    expect(mockEmitWithErrorHandling).toHaveBeenCalledWith(SessionEvents.LIST, {
      projectPath: '/test',
    });
    expect(result).toEqual([mockSession]);
  });

  it('passes undefined projectPath when not specified', async () => {
    mockEmitWithErrorHandling.mockResolvedValue([]);

    await listSessions();

    expect(mockEmitWithErrorHandling).toHaveBeenCalledWith(SessionEvents.LIST, {
      projectPath: undefined,
    });
  });
});

describe('resumeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitAsync with SessionEvents.RESUME and returns session', async () => {
    mockEmitAsync.mockResolvedValue({ session: mockSession });

    const result = await resumeSession('claude-sess-1', '/test', 'main', 'Resumed');

    expect(mockEmitAsync).toHaveBeenCalledWith(SessionEvents.RESUME, {
      claudeSessionId: 'claude-sess-1',
      projectPath: '/test',
      branch: 'main',
      name: 'Resumed',
    });
    expect(result).toEqual(mockSession);
  });

  it('throws when server returns error', async () => {
    mockEmitAsync.mockResolvedValue({ error: 'Session not found' });

    await expect(resumeSession('bad-id', '/test')).rejects.toThrow('Session not found');
  });

  it('throws when no session returned', async () => {
    mockEmitAsync.mockResolvedValue({});

    await expect(resumeSession('id', '/test')).rejects.toThrow('No session returned from server');
  });
});

describe('forkSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitAsync with SessionEvents.FORK and returns session', async () => {
    mockEmitAsync.mockResolvedValue({ session: mockSession });

    const result = await forkSession('claude-sess-1', '/test', 'feature', 'Fork');

    expect(mockEmitAsync).toHaveBeenCalledWith(SessionEvents.FORK, {
      claudeSessionId: 'claude-sess-1',
      projectPath: '/test',
      branch: 'feature',
      name: 'Fork',
    });
    expect(result).toEqual(mockSession);
  });

  it('throws on error response', async () => {
    mockEmitAsync.mockResolvedValue({ error: 'Fork failed' });

    await expect(forkSession('id', '/test')).rejects.toThrow('Fork failed');
  });
});

describe('continueLastSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls emitAsync with SessionEvents.CONTINUE_LAST and returns session', async () => {
    mockEmitAsync.mockResolvedValue({ session: mockSession });

    const result = await continueLastSession('/test', 'main', 'Continue');

    expect(mockEmitAsync).toHaveBeenCalledWith(SessionEvents.CONTINUE_LAST, {
      projectPath: '/test',
      branch: 'main',
      name: 'Continue',
    });
    expect(result).toEqual(mockSession);
  });

  it('throws on error response', async () => {
    mockEmitAsync.mockResolvedValue({ error: 'No previous session' });

    await expect(continueLastSession('/test')).rejects.toThrow('No previous session');
  });

  it('throws when no session returned', async () => {
    mockEmitAsync.mockResolvedValue({});

    await expect(continueLastSession('/test')).rejects.toThrow('No session returned from server');
  });
});
