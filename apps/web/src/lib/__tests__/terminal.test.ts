import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket, mockSocketModule } from '../../test/mocks/socket';

vi.mock('@/lib/socket', () => mockSocketModule);

import {
  spawnTerminal,
  connectTerminal,
  writeToTerminal,
  writeToTerminalChunked,
  resizeTerminal,
  killTerminal,
  joinTerminal,
} from '../terminal';
import { TerminalEvents } from '@omniscribe/shared';
import { PASTE_CHUNK_SIZE, PASTE_CHUNK_DELAY_MS } from '../terminal-constants';

describe('spawnTerminal', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockSocketModule.connectSocket.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls connectSocket before emitting', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ sessionId: 1 });
      }
    );

    await spawnTerminal('/project');
    expect(mockSocketModule.connectSocket).toHaveBeenCalled();
  });

  it('resolves with sessionId on success', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ sessionId: 42 });
      }
    );

    const result = await spawnTerminal('/project', { FOO: 'bar' });
    expect(result).toBe(42);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      TerminalEvents.SPAWN,
      { cwd: '/project', env: { FOO: 'bar' } },
      expect.any(Function)
    );
  });

  it('rejects with error when callback has error field', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ error: 'Failed to spawn' });
      }
    );

    await expect(spawnTerminal()).rejects.toThrow('Failed to spawn');
  });

  it('rejects with timeout error after 10 seconds', async () => {
    mockSocket.emit.mockImplementation(() => {});

    const promise = spawnTerminal();
    const rejection = expect(promise).rejects.toThrow('Terminal spawn timeout');
    await vi.advanceTimersByTimeAsync(10000);
    await rejection;
  });
});

describe('connectTerminal', () => {
  beforeEach(() => {
    mockSocket.__reset();
  });

  it('returns TerminalConnection with correct properties', () => {
    const onOutput = vi.fn();
    const onClose = vi.fn();
    const connection = connectTerminal(1, onOutput, onClose);

    expect(connection.sessionId).toBe(1);
    expect(connection.onOutput).toBe(onOutput);
    expect(connection.onClose).toBe(onClose);
    expect(typeof connection.cleanup).toBe('function');
  });

  it('registers listeners for output and closed events', () => {
    connectTerminal(1, vi.fn(), vi.fn());

    expect(mockSocket.on).toHaveBeenCalledWith(TerminalEvents.OUTPUT, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(TerminalEvents.CLOSED, expect.any(Function));
  });

  it('fires onOutput for matching sessionId', () => {
    const onOutput = vi.fn();
    connectTerminal(1, onOutput, vi.fn());

    mockSocket.__simulateEvent(TerminalEvents.OUTPUT, { sessionId: 1, data: 'hello' });
    expect(onOutput).toHaveBeenCalledWith('hello');
  });

  it('does not fire onOutput for non-matching sessionId', () => {
    const onOutput = vi.fn();
    connectTerminal(1, onOutput, vi.fn());

    mockSocket.__simulateEvent(TerminalEvents.OUTPUT, { sessionId: 2, data: 'hello' });
    expect(onOutput).not.toHaveBeenCalled();
  });

  it('fires onClose for matching sessionId with exitCode and signal', () => {
    const onClose = vi.fn();
    connectTerminal(1, vi.fn(), onClose);

    mockSocket.__simulateEvent(TerminalEvents.CLOSED, { sessionId: 1, exitCode: 0, signal: 15 });
    expect(onClose).toHaveBeenCalledWith(0, 15);
  });

  it('does not fire onClose for non-matching sessionId', () => {
    const onClose = vi.fn();
    connectTerminal(1, vi.fn(), onClose);

    mockSocket.__simulateEvent(TerminalEvents.CLOSED, { sessionId: 2, exitCode: 1 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cleanup removes registered listeners', () => {
    const connection = connectTerminal(1, vi.fn(), vi.fn());

    connection.cleanup();

    expect(mockSocket.off).toHaveBeenCalledWith(TerminalEvents.OUTPUT, expect.any(Function));
    expect(mockSocket.off).toHaveBeenCalledWith(TerminalEvents.CLOSED, expect.any(Function));
  });
});

describe('writeToTerminal', () => {
  beforeEach(() => {
    mockSocket.__reset();
  });

  it('emits terminal:input when connected', () => {
    mockSocket.connected = true;
    writeToTerminal(1, 'ls -la');

    expect(mockSocket.emit).toHaveBeenCalledWith(TerminalEvents.INPUT, {
      sessionId: 1,
      data: 'ls -la',
    });
  });

  it('does not emit when socket is not connected', () => {
    mockSocket.connected = false;
    writeToTerminal(1, 'ls');

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});

describe('writeToTerminalChunked', () => {
  beforeEach(() => {
    mockSocket.__reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not emit when socket is not connected', async () => {
    mockSocket.connected = false;
    await writeToTerminalChunked(1, 'data');

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it('sends single event for data within chunk size', async () => {
    mockSocket.connected = true;
    const data = 'a'.repeat(PASTE_CHUNK_SIZE);

    await writeToTerminalChunked(1, data);

    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).toHaveBeenCalledWith(TerminalEvents.INPUT, {
      sessionId: 1,
      data,
    });
  });

  it('chunks data exceeding chunk size with delays', async () => {
    mockSocket.connected = true;
    const data = 'a'.repeat(PASTE_CHUNK_SIZE + 100);

    const promise = writeToTerminalChunked(1, data);

    // First chunk emitted immediately
    expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    expect(mockSocket.emit).toHaveBeenCalledWith(TerminalEvents.INPUT, {
      sessionId: 1,
      data: data.slice(0, PASTE_CHUNK_SIZE),
    });

    // Advance past the delay for the second chunk
    await vi.advanceTimersByTimeAsync(PASTE_CHUNK_DELAY_MS);
    await promise;

    expect(mockSocket.emit).toHaveBeenCalledTimes(2);
    expect(mockSocket.emit).toHaveBeenLastCalledWith(TerminalEvents.INPUT, {
      sessionId: 1,
      data: data.slice(PASTE_CHUNK_SIZE),
    });
  });
});

describe('resizeTerminal', () => {
  beforeEach(() => {
    mockSocket.__reset();
  });

  it('emits terminal:resize when connected', () => {
    mockSocket.connected = true;
    resizeTerminal(1, 80, 24);

    expect(mockSocket.emit).toHaveBeenCalledWith(TerminalEvents.RESIZE, {
      sessionId: 1,
      cols: 80,
      rows: 24,
    });
  });

  it('does not emit when socket is not connected', () => {
    mockSocket.connected = false;
    resizeTerminal(1, 80, 24);

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});

describe('killTerminal', () => {
  beforeEach(() => {
    mockSocket.__reset();
  });

  it('emits terminal:kill when connected', () => {
    mockSocket.connected = true;
    killTerminal(1);

    expect(mockSocket.emit).toHaveBeenCalledWith(TerminalEvents.KILL, { sessionId: 1 });
  });

  it('does not emit when socket is not connected', () => {
    mockSocket.connected = false;
    killTerminal(1);

    expect(mockSocket.emit).not.toHaveBeenCalled();
  });
});

describe('joinTerminal', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockSocketModule.connectSocket.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls connectSocket before emitting', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ success: true, scrollback: 'data' });
      }
    );

    await joinTerminal(1);
    expect(mockSocketModule.connectSocket).toHaveBeenCalled();
  });

  it('resolves with success and scrollback on successful callback', async () => {
    mockSocket.emit.mockImplementation(
      (_event: string, _payload: unknown, callback: (response: unknown) => void) => {
        callback({ success: true, scrollback: 'history data' });
      }
    );

    const result = await joinTerminal(1);
    expect(result).toEqual({ success: true, scrollback: 'history data' });
    expect(mockSocket.emit).toHaveBeenCalledWith(
      TerminalEvents.JOIN,
      { sessionId: 1 },
      expect.any(Function)
    );
  });

  it('resolves with { success: false } on 5s timeout', async () => {
    mockSocket.emit.mockImplementation(() => {});

    const promise = joinTerminal(1);
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result).toEqual({ success: false });
  });
});
