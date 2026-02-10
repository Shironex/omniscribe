import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket, mockSocketModule } from '../../test/mocks/socket';

// Mock the socket module before importing socketHelpers
vi.mock('@/lib/socket', () => mockSocketModule);

import { emitAsync, emitWithErrorHandling, emitWithSuccessHandling } from '../socketHelpers';

describe('emitAsync', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockSocket.connected = true;
    mockSocketModule.connectSocket.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the response from the server callback', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ data: 'test-response' });
      }
    );

    const result = await emitAsync<{ id: string }, { data: string }>('test:event', { id: '123' });
    expect(result).toEqual({ data: 'test-response' });
    expect(mockSocket.emit).toHaveBeenCalledWith('test:event', { id: '123' }, expect.any(Function));
  });

  it('rejects with timeout error when server does not respond', async () => {
    // emit never calls the callback
    mockSocket.emit.mockImplementation(() => {});

    const promise = emitAsync('test:event', {}, { timeout: 500 });

    // Attach the rejection handler before advancing timers to avoid
    // Vitest's "unhandled rejection" warning
    const rejection = expect(promise).rejects.toThrow(
      "Socket request 'test:event' timed out after 500ms"
    );

    await vi.advanceTimersByTimeAsync(500);

    await rejection;
  });

  it('auto-connects when socket is disconnected (autoConnect default true)', async () => {
    mockSocket.connected = false;
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ ok: true });
      }
    );

    await emitAsync('test:event', {});
    expect(mockSocketModule.connectSocket).toHaveBeenCalled();
  });

  it('does not auto-connect when autoConnect is false', async () => {
    mockSocket.connected = false;
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ ok: true });
      }
    );

    await emitAsync('test:event', {}, { autoConnect: false });
    expect(mockSocketModule.connectSocket).not.toHaveBeenCalled();
  });

  it('clears the timeout when the server responds in time', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        // Respond immediately
        callback({ ok: true });
      }
    );

    const result = await emitAsync('test:event', {}, { timeout: 5000 });
    expect(result).toEqual({ ok: true });

    // Advance past timeout - should not throw
    vi.advanceTimersByTime(10000);
  });
});

describe('emitWithErrorHandling', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockSocket.connected = true;
    mockSocketModule.connectSocket.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the response when no error field', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ id: 'session-1', name: 'Test' });
      }
    );

    const result = await emitWithErrorHandling<{ id: string }, { id: string; name: string }>(
      'session:create',
      { id: '1' }
    );
    expect(result).toEqual({ id: 'session-1', name: 'Test' });
  });

  it('rejects when response contains an error field', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ error: 'Session limit reached' });
      }
    );

    await expect(emitWithErrorHandling('session:create', { id: '1' })).rejects.toThrow(
      'Session limit reached'
    );
  });
});

describe('emitWithSuccessHandling', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockSocket.connected = true;
    mockSocketModule.connectSocket.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when response.success is true', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ success: true });
      }
    );

    await expect(
      emitWithSuccessHandling('session:remove', { sessionId: '1' })
    ).resolves.toBeUndefined();
  });

  it('rejects with response.error when success is false', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ success: false, error: 'Not found' });
      }
    );

    await expect(emitWithSuccessHandling('session:remove', { sessionId: '1' })).rejects.toThrow(
      'Not found'
    );
  });

  it('rejects with default error message when success is false and no error', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ success: false });
      }
    );

    await expect(
      emitWithSuccessHandling('session:remove', { sessionId: '1' }, {}, 'Custom failure')
    ).rejects.toThrow('Custom failure');
  });

  it('uses "Operation failed" as the default error message', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ success: false });
      }
    );

    await expect(emitWithSuccessHandling('session:remove', { sessionId: '1' })).rejects.toThrow(
      'Operation failed'
    );
  });
});
