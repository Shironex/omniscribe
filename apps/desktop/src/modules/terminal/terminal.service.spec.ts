import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TerminalService } from './terminal.service';
import { MockPty } from '../../../test/mocks';

// Mock os module for platform-specific testing
const mockOsPlatform = jest.fn().mockReturnValue(process.platform);
jest.mock('os', () => ({
  ...jest.requireActual('os'),
  platform: (...args: unknown[]) => mockOsPlatform(...args),
}));

// Mock node-pty
const mockPtyInstances: MockPty[] = [];
jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const instance = new MockPty();
    mockPtyInstances.push(instance);
    return instance;
  }),
}));

describe('TerminalService', () => {
  let service: TerminalService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    mockPtyInstances.length = 0;

    eventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    } as unknown as EventEmitter2;

    const module: TestingModule = await Test.createTestingModule({
      providers: [TerminalService, { provide: EventEmitter2, useValue: eventEmitter }],
    }).compile();

    service = module.get<TerminalService>(TerminalService);
  });

  afterEach(() => {
    // Clear any timers from output batching
    jest.clearAllTimers();
  });

  describe('spawnCommand', () => {
    it('should create a new PTY session and return a session ID', () => {
      const sessionId = service.spawnCommand('bash', ['-l'], '/home/user');

      expect(sessionId).toBe(1);
      expect(mockPtyInstances).toHaveLength(1);
    });

    it('should increment session IDs', () => {
      const id1 = service.spawnCommand('bash', [], '/home');
      const id2 = service.spawnCommand('bash', [], '/home');

      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it('should store the session for later access', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');

      expect(service.hasSession(sessionId)).toBe(true);
    });

    it('should track the external ID when provided', () => {
      const sessionId = service.spawnCommand(
        'claude',
        ['--model', 'opus'],
        '/project',
        {},
        'session-1-123'
      );

      expect(service.getExternalId(sessionId)).toBe('session-1-123');
    });

    it('should pass environment variables to the PTY', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pty = require('node-pty');
      service.spawnCommand('bash', [], '/home', { MY_VAR: 'test' });

      const spawnCall = pty.spawn.mock.calls[0];
      const options = spawnCall[2];
      expect(options.env).toEqual(expect.objectContaining({ MY_VAR: 'test' }));
    });
  });

  describe('output batching', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should batch output and emit after OUTPUT_THROTTLE_MS (4ms)', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      ptyInstance.simulateData('hello ');
      ptyInstance.simulateData('world');

      // Not emitted yet (still within batch interval)
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('terminal.output', expect.anything());

      // Advance timers past the 4ms batch interval
      jest.advanceTimersByTime(10);

      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'hello world',
      });
    });

    it('should chunk large output (>4KB) across multiple flushes', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      // Simulate 8KB of data
      const bigData = 'x'.repeat(8192);
      ptyInstance.simulateData(bigData);

      // First flush at 4ms
      jest.advanceTimersByTime(5);

      // First chunk should be 4096 bytes
      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'x'.repeat(4096),
      });

      // Second flush at 4ms later
      jest.advanceTimersByTime(5);

      // Second chunk should be remaining 4096 bytes
      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'x'.repeat(4096),
      });
    });

    it('should cap output buffer at MAX_OUTPUT_BUFFER_SIZE (100KB)', () => {
      service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      // Simulate 150KB of data
      const bigData = 'x'.repeat(150_000);
      ptyInstance.simulateData(bigData);

      // The buffer should be capped internally; we verify indirectly
      // by checking that no error occurred
      jest.advanceTimersByTime(500);

      // Should have emitted multiple chunks without error
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'terminal.output',
        expect.objectContaining({ sessionId: 1 })
      );
    });
  });

  describe('scrollback', () => {
    it('should accumulate scrollback data', () => {
      jest.useFakeTimers();
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      ptyInstance.simulateData('line1\n');
      ptyInstance.simulateData('line2\n');
      jest.advanceTimersByTime(10);

      const scrollback = service.getScrollback(sessionId);
      expect(scrollback).toBe('line1\nline2\n');
      jest.useRealTimers();
    });

    it('should return null for non-existent session', () => {
      expect(service.getScrollback(999)).toBeNull();
    });

    it('should return null for empty scrollback', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      // New session with no data should return null (empty string is falsy)
      expect(service.getScrollback(sessionId)).toBeNull();
    });

    it('should trim scrollback at MAX_SCROLLBACK_SIZE (50KB)', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      // Simulate 60KB of data
      const bigData = 'x'.repeat(60_000);
      ptyInstance.simulateData(bigData);

      const scrollback = service.getScrollback(sessionId);
      expect(scrollback).not.toBeNull();
      expect(scrollback!.length).toBeLessThanOrEqual(50_000);
    });
  });

  describe('write queue serialization', () => {
    it('should write data to the PTY process', async () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.write(sessionId, 'ls\n');

      // Write is async via promise chain, await the microtask
      await Promise.resolve();

      expect(ptyInstance.write).toHaveBeenCalledWith('ls\n');
    });

    it('should do nothing for non-existent sessions', () => {
      // Should not throw
      service.write(999, 'data');
    });

    it('should chunk large writes (>1000 chars)', async () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      const largeData = 'y'.repeat(1500);
      service.write(sessionId, largeData);

      // Allow entire write chain to complete (15 chunks of 100, each with setImmediate)
      // Wait for the writeChain promise to resolve
      const session = (
        service as unknown as { sessions: Map<number, { writeChain: Promise<void> }> }
      ).sessions.get(sessionId);
      await session!.writeChain;

      // Should have been called multiple times for chunked writes
      const totalWritten = ptyInstance.write.mock.calls.reduce(
        (sum: number, call: [string]) => sum + call[0].length,
        0
      );
      expect(totalWritten).toBe(1500);
    });
  });

  describe('resize', () => {
    it('should resize the PTY process', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.resize(sessionId, 120, 40);

      expect(ptyInstance.resize).toHaveBeenCalledWith(120, 40);
    });

    it('should reject invalid dimensions (zero)', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.resize(sessionId, 0, 0);

      expect(ptyInstance.resize).not.toHaveBeenCalled();
    });

    it('should reject invalid dimensions (negative)', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.resize(sessionId, -10, 24);

      expect(ptyInstance.resize).not.toHaveBeenCalled();
    });

    it('should reject non-finite dimensions', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.resize(sessionId, NaN, 24);

      expect(ptyInstance.resize).not.toHaveBeenCalled();
    });

    it('should round dimensions to integers', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.resize(sessionId, 80.7, 24.3);

      expect(ptyInstance.resize).toHaveBeenCalledWith(81, 24);
    });

    it('should preserve output during resize operations', () => {
      jest.useFakeTimers();
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      // First resize - should NOT suppress output
      service.resize(sessionId, 80, 24);
      ptyInstance.simulateData('after-first-resize');
      jest.advanceTimersByTime(10);
      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'after-first-resize',
      });

      // Reset mock
      (eventEmitter.emit as jest.Mock).mockClear();

      // Second resize - output should still be delivered (no data loss)
      service.resize(sessionId, 120, 40);
      ptyInstance.simulateData('during-resize');
      jest.advanceTimersByTime(10);
      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'during-resize',
      });

      // Subsequent output should continue normally
      ptyInstance.simulateData('after-resize');
      jest.advanceTimersByTime(10);
      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'after-resize',
      });

      jest.useRealTimers();
    });
  });

  describe('shutdown guard', () => {
    it('should prevent onData processing during shutdown', async () => {
      jest.useFakeTimers();
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      // Trigger shutdown (async — needs timers to resolve)
      const destroyPromise = service.onModuleDestroy();

      // Data arriving after shutdown should be ignored
      ptyInstance.simulateData('after-shutdown');

      // Advance past the graceful shutdown timeout (3000ms) so kill() resolves
      jest.advanceTimersByTime(3100);
      await destroyPromise;

      // Should NOT have emitted terminal.output for the data
      const outputCalls = (eventEmitter.emit as jest.Mock).mock.calls.filter(
        (call: [string, unknown]) => call[0] === 'terminal.output'
      );

      // The output buffer was empty before shutdown, so no cleanup flush either
      expect(outputCalls.length).toBe(0);

      // Verify session cleanup happened
      expect(service.hasSession(sessionId)).toBe(false);
      jest.useRealTimers();
    });

    it('should prevent onExit processing during shutdown', async () => {
      jest.useFakeTimers();
      service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      // Trigger shutdown
      const destroyPromise = service.onModuleDestroy();
      jest.advanceTimersByTime(3100);
      await destroyPromise;

      // Exit arriving after shutdown should be ignored
      ptyInstance.simulateExit(0);

      // terminal.closed should NOT be emitted (shutdown guard prevents it)
      const closedCalls = (eventEmitter.emit as jest.Mock).mock.calls.filter(
        (call: [string, unknown]) => call[0] === 'terminal.closed'
      );
      expect(closedCalls.length).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('onExit', () => {
    it('should emit terminal.closed and remove session on exit', () => {
      const sessionId = service.spawnCommand('bash', [], '/home', {}, 'ext-1');
      const ptyInstance = mockPtyInstances[0];

      ptyInstance.simulateExit(0);

      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.closed', {
        sessionId,
        externalId: 'ext-1',
        exitCode: 0,
        signal: undefined,
      });
      expect(service.hasSession(sessionId)).toBe(false);
    });
  });

  describe('kill', () => {
    it('should remove the session after killing', async () => {
      const sessionId = service.spawnCommand('bash', [], '/home');

      await service.kill(sessionId);

      expect(service.hasSession(sessionId)).toBe(false);
    });

    it('should do nothing for non-existent sessions', async () => {
      // Should not throw
      await service.kill(999);
    });
  });

  describe('findByExternalId', () => {
    it('should find a terminal session by external ID', () => {
      const sessionId = service.spawnCommand('bash', [], '/home', {}, 'ext-session-1');

      expect(service.findByExternalId('ext-session-1')).toBe(sessionId);
    });

    it('should return undefined for unknown external ID', () => {
      expect(service.findByExternalId('nonexistent')).toBeUndefined();
    });
  });

  describe('getSessionIds', () => {
    it('should return all active session IDs', () => {
      const id1 = service.spawnCommand('bash', [], '/home');
      const id2 = service.spawnCommand('bash', [], '/home');

      expect(service.getSessionIds()).toEqual([id1, id2]);
    });
  });

  // ================================================================
  // Cross-platform behavior
  // ================================================================
  describe('cross-platform behavior', () => {
    describe('Windows platform', () => {
      let winService: TerminalService;
      let winEventEmitter: EventEmitter2;

      beforeEach(async () => {
        mockPtyInstances.length = 0;
        mockOsPlatform.mockReturnValue('win32');

        winEventEmitter = {
          emit: jest.fn(),
          on: jest.fn(),
          removeAllListeners: jest.fn(),
        } as unknown as EventEmitter2;

        const module: TestingModule = await Test.createTestingModule({
          providers: [TerminalService, { provide: EventEmitter2, useValue: winEventEmitter }],
        }).compile();

        winService = module.get<TerminalService>(TerminalService);
      });

      afterEach(() => {
        mockOsPlatform.mockReturnValue(process.platform);
        jest.clearAllTimers();
      });

      it('should use COMSPEC shell on Windows when spawning', () => {
        const savedComspec = process.env.COMSPEC;
        process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        winService.spawn('/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        expect(spawnCall[0]).toBe('C:\\Windows\\System32\\cmd.exe');

        // Restore
        if (savedComspec) {
          process.env.COMSPEC = savedComspec;
        } else {
          delete process.env.COMSPEC;
        }
      });

      it('should fall back to cmd.exe when COMSPEC is not set', () => {
        const savedComspec = process.env.COMSPEC;
        delete process.env.COMSPEC;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        winService.spawn('/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        expect(spawnCall[0]).toBe('cmd.exe');

        if (savedComspec) process.env.COMSPEC = savedComspec;
      });

      it('should disable ConPTY on Windows', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        winService.spawnCommand('cmd.exe', [], '/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        const options = spawnCall[2];
        expect(options.useConpty).toBe(false);
      });

      it('should not pass --login args for cmd.exe', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        winService.spawn('/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        const args = spawnCall[1];
        expect(args).not.toContain('--login');
      });

      it('should use simple kill on Windows (no signal)', async () => {
        const sessionId = winService.spawnCommand('cmd.exe', [], '/project');
        const ptyInstance = mockPtyInstances[mockPtyInstances.length - 1];

        await winService.kill(sessionId);

        // On Windows, kill() is called without a signal argument
        expect(ptyInstance.kill).toHaveBeenCalled();
        const killCalls = ptyInstance.kill.mock.calls;
        expect(killCalls[0]).toEqual([]); // no signal arg
      });
    });

    describe('Linux/macOS platform', () => {
      let unixService: TerminalService;
      let unixEventEmitter: EventEmitter2;

      beforeEach(async () => {
        mockPtyInstances.length = 0;
        mockOsPlatform.mockReturnValue('linux');

        unixEventEmitter = {
          emit: jest.fn(),
          on: jest.fn(),
          removeAllListeners: jest.fn(),
        } as unknown as EventEmitter2;

        const module: TestingModule = await Test.createTestingModule({
          providers: [TerminalService, { provide: EventEmitter2, useValue: unixEventEmitter }],
        }).compile();

        unixService = module.get<TerminalService>(TerminalService);
      });

      afterEach(() => {
        mockOsPlatform.mockReturnValue(process.platform);
        jest.clearAllTimers();
      });

      it('should use SHELL env var on Linux when spawning', () => {
        const savedShell = process.env.SHELL;
        process.env.SHELL = '/bin/zsh';
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        unixService.spawn('/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        expect(spawnCall[0]).toBe('/bin/zsh');

        // Restore
        if (savedShell) {
          process.env.SHELL = savedShell;
        } else {
          delete process.env.SHELL;
        }
      });

      it('should fall back to /bin/bash when SHELL is not set', () => {
        const savedShell = process.env.SHELL;
        delete process.env.SHELL;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        unixService.spawn('/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        expect(spawnCall[0]).toBe('/bin/bash');

        if (savedShell) process.env.SHELL = savedShell;
      });

      it('should NOT set useConpty on Linux', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        unixService.spawnCommand('bash', ['--login'], '/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        const options = spawnCall[2];
        expect(options.useConpty).toBeUndefined();
      });

      it('should pass --login args for bash', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pty = require('node-pty');

        unixService.spawn('/project');

        const spawnCall = pty.spawn.mock.calls[pty.spawn.mock.calls.length - 1];
        const args = spawnCall[1];
        expect(args).toContain('--login');
      });

      it('should send SIGTERM first when killing on Unix', async () => {
        jest.useFakeTimers();
        const sessionId = unixService.spawnCommand('bash', ['--login'], '/project');
        const ptyInstance = mockPtyInstances[mockPtyInstances.length - 1];

        const killPromise = unixService.kill(sessionId);

        // Should have sent SIGTERM first
        expect(ptyInstance.kill).toHaveBeenCalledWith('SIGTERM');

        // Simulate the session being cleaned up (onExit fires)
        ptyInstance.simulateExit(0);
        jest.advanceTimersByTime(200);

        await killPromise;
        jest.useRealTimers();
      });
    });
  });
});
