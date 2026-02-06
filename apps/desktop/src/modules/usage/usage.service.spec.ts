import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';

// ---- Mocks ----

// Mock child_process
const mockSpawn = jest.fn();
const mockExecSync = jest.fn();
jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock os module for platform-specific testing
const mockOsPlatform = jest.fn().mockReturnValue(process.platform);
const mockOsArch = jest.fn().mockReturnValue(process.arch);
jest.mock('os', () => ({
  platform: (...args: unknown[]) => mockOsPlatform(...args),
  arch: (...args: unknown[]) => mockOsArch(...args),
}));

// Mock node-pty
const mockPtySpawn = jest.fn();
jest.mock('node-pty', () => ({
  spawn: (...args: unknown[]) => mockPtySpawn(...args),
}));

// ---- Helpers ----

/**
 * Create a fake child process EventEmitter for spawn() calls.
 * Call `fakeProc.emitClose(code)` or `fakeProc.emitError(err)` to trigger.
 */
function createFakeProc() {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const proc = {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return proc;
    },
    kill: jest.fn(),
    emitClose(code: number) {
      for (const cb of listeners['close'] ?? []) cb(code);
    },
    emitError(err: Error) {
      for (const cb of listeners['error'] ?? []) cb(err);
    },
  };
  return proc;
}

/**
 * Create a fake PTY process for node-pty.spawn() calls.
 */
function createFakePty() {
  const dataListeners: ((data: string) => void)[] = [];
  const exitListeners: ((ev: { exitCode: number }) => void)[] = [];
  const fakePty = {
    onData(cb: (data: string) => void) {
      dataListeners.push(cb);
    },
    onExit(cb: (ev: { exitCode: number }) => void) {
      exitListeners.push(cb);
    },
    write: jest.fn(),
    kill: jest.fn(),
    // Helpers to simulate events
    emitData(data: string) {
      for (const cb of dataListeners) cb(data);
    },
    emitExit(exitCode: number) {
      for (const cb of exitListeners) cb({ exitCode });
    },
  };
  return fakePty;
}

// ---- Tests ----

describe('UsageService', () => {
  let service: UsageService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers({ advanceTimers: true });

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsageService],
    }).compile();

    service = module.get<UsageService>(UsageService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ================================================================
  // isAvailable()
  // ================================================================
  describe('isAvailable', () => {
    it('should return true when the CLI is found on PATH', async () => {
      const fakeProc = createFakeProc();
      mockSpawn.mockReturnValue(fakeProc);

      const promise = service.isAvailable();
      fakeProc.emitClose(0);

      await expect(promise).resolves.toBe(true);
    });

    it('should return false when the CLI is not found', async () => {
      const fakeProc = createFakeProc();
      mockSpawn.mockReturnValue(fakeProc);

      const promise = service.isAvailable();
      fakeProc.emitClose(1);

      await expect(promise).resolves.toBe(false);
    });

    it('should return false when spawn emits an error', async () => {
      const fakeProc = createFakeProc();
      mockSpawn.mockReturnValue(fakeProc);

      const promise = service.isAvailable();
      fakeProc.emitError(new Error('ENOENT'));

      await expect(promise).resolves.toBe(false);
    });

    it('should use "where" on Windows and "which" on other platforms', async () => {
      const fakeProc = createFakeProc();
      mockSpawn.mockReturnValue(fakeProc);

      const promise = service.isAvailable();
      fakeProc.emitClose(0);
      await promise;

      // The service checks os.platform() at class construction time.
      // On Windows (our test env), it should use 'where'.
      const calledCommand = mockSpawn.mock.calls[0][0];
      expect(['where', 'which']).toContain(calledCommand);
      expect(mockSpawn.mock.calls[0][1]).toEqual(['claude']);
    });
  });

  // ================================================================
  // getStatus()
  // ================================================================
  describe('getStatus', () => {
    it('should return not-installed status when CLI is not available', async () => {
      // isAvailable => false
      const fakeProc = createFakeProc();
      mockSpawn.mockReturnValue(fakeProc);

      const promise = service.getStatus();
      fakeProc.emitClose(1); // not found

      const status = await promise;

      expect(status.installed).toBe(false);
      expect(status.auth.authenticated).toBe(false);
      expect(status.platform).toBeDefined();
      expect(status.arch).toBeDefined();
    });

    it('should return installed status with version and path when CLI is available', async () => {
      // isAvailable => true (spawn for 'where'/'which')
      mockSpawn.mockImplementation((_cmd: string, _args: string[]) => {
        const proc = createFakeProc();
        // Immediately resolve on next tick
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });

      // execSync for version
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'Claude Code v1.0.27\n';
        // 'where'/'which' for path
        return '/usr/local/bin/claude\n';
      });

      jest.advanceTimersByTime(0);
      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.version).toBe('1.0.27');
      expect(status.path).toBe('/usr/local/bin/claude');
      expect(status.method).toBe('path');
    });

    it('should handle version check failure gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) throw new Error('version failed');
        return '/usr/local/bin/claude\n';
      });

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.version).toBeUndefined();
    });

    it('should handle path check failure gracefully', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'Claude Code v1.0.27\n';
        throw new Error('path failed');
      });

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.path).toBeUndefined();
    });

    it('should return cached status on subsequent calls within TTL', async () => {
      // First call
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });
      mockExecSync.mockReturnValue('Claude Code v1.0.27\n');

      const first = await service.getStatus();

      // Clear mocks - second call should NOT trigger new spawns
      mockSpawn.mockClear();
      mockExecSync.mockClear();

      const second = await service.getStatus();

      expect(second).toEqual(first);
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('should refresh when forceRefresh is true even within TTL', async () => {
      // First call
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });
      mockExecSync.mockReturnValue('Claude Code v1.0.27\n');

      await service.getStatus();

      // Force refresh
      mockSpawn.mockClear();
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });
      mockExecSync.mockReturnValue('Claude Code v2.0.0\n');

      const refreshed = await service.getStatus(true);

      // spawn should have been called again
      expect(mockSpawn).toHaveBeenCalled();
      expect(refreshed.version).toBe('2.0.0');
    });

    it('should refresh after cache TTL expires', async () => {
      // First call
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });
      mockExecSync.mockReturnValue('Claude Code v1.0.27\n');

      await service.getStatus();

      // Advance time past TTL (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      mockSpawn.mockClear();
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });
      mockExecSync.mockReturnValue('Claude Code v2.0.0\n');

      const refreshed = await service.getStatus();

      expect(mockSpawn).toHaveBeenCalled();
      expect(refreshed.version).toBe('2.0.0');
    });

    it('should parse version from various formats', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });

      // Without "v" prefix
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return '1.2.3\n';
        return '/usr/local/bin/claude\n';
      });

      const status = await service.getStatus();
      expect(status.version).toBe('1.2.3');
    });

    it('should handle multiline path output (use first line)', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(0), 0);
        return proc;
      });

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('--version')) return 'Claude Code v1.0.0\n';
        // 'where' on Windows can return multiple lines
        return 'C:\\Users\\user\\AppData\\Roaming\\npm\\claude\nC:\\Program Files\\claude\n';
      });

      const status = await service.getStatus();
      expect(status.path).toBe('C:\\Users\\user\\AppData\\Roaming\\npm\\claude');
    });
  });

  // ================================================================
  // fetchUsageData()
  // ================================================================
  describe('fetchUsageData', () => {
    it('should return parsed usage on success', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      // Simulate REPL ready, then usage output, then exit
      const usageOutput = [
        'Welcome back, user! Claude API',
        '? for shortcuts',
        'Current session',
        '  25% used',
        '  Resets in 2h 15m',
        'Current week (all models)',
        '  40% used',
        '  Resets Dec 22 at 8pm',
        'Current week (Sonnet only)',
        '  10% used',
        '  Resets Dec 27 at 9:59am',
      ].join('\n');

      fakePty.emitData(usageOutput);

      // Let timers run for REPL detection, /usage command, and escape sequence
      jest.advanceTimersByTime(10000);

      fakePty.emitExit(0);

      const result = await promise;

      expect(result.usage).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.usage!.sessionPercentage).toBe(25);
      expect(result.usage!.weeklyPercentage).toBe(40);
      expect(result.usage!.sonnetWeeklyPercentage).toBe(10);
      expect(result.usage!.lastUpdated).toBeDefined();
      expect(result.usage!.userTimezone).toBeDefined();
    });

    it('should return auth_required error when authentication fails', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      // Simulate auth error
      fakePty.emitData('OAuth token does not meet scope requirement');
      jest.advanceTimersByTime(100);

      const result = await promise;

      expect(result.error).toBe('auth_required');
      expect(result.usage).toBeUndefined();
    });

    it('should return trust_prompt error when trust prompt is pending', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      // Simulate trust prompt but no response before timeout
      fakePty.emitData('Do you want to work in this folder?');
      jest.advanceTimersByTime(100);

      // Simulate timeout
      jest.advanceTimersByTime(45000);

      const result = await promise;

      expect(result.error).toBe('trust_prompt');
      expect(result.message).toContain('TRUST_PROMPT');
    });

    it('should return timeout error when CLI takes too long', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      // Emit some data but not usage data
      fakePty.emitData('Loading...');

      // Let the timeout fire
      jest.advanceTimersByTime(45000);

      const result = await promise;

      expect(result.error).toBe('timeout');
      expect(result.message).toContain('too long');
    });

    it('should return cli_not_found error when CLI not available', async () => {
      mockPtySpawn.mockImplementation(() => {
        throw new Error('Program not found');
      });

      const result = await service.fetchUsageData('/project');

      expect(result.error).toBe('cli_not_found');
      expect(result.message).toContain('not found');
    });

    it('should return unknown error for unrecognized failures', async () => {
      mockPtySpawn.mockImplementation(() => {
        throw new Error('Unexpected failure');
      });

      const result = await service.fetchUsageData('/project');

      expect(result.error).toBe('unknown');
    });

    it('should handle PTY spawn failure', async () => {
      mockPtySpawn.mockImplementation(() => {
        throw new Error('Unable to access terminal: spawn failed');
      });

      const result = await service.fetchUsageData('/project');

      expect(result.error).toBeDefined();
      expect(result.message).toContain('Unable to access terminal');
    });

    it('should handle exit with non-zero code and no output', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitExit(1);

      const result = await promise;

      expect(result.error).toBeDefined();
      expect(result.message).toContain('exited with code 1');
    });

    it('should handle exit with zero code but empty output', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitExit(0);

      const result = await promise;

      expect(result.error).toBeDefined();
      expect(result.message).toContain('No output');
    });

    it('should handle token_expired authentication error on exit', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitData('some setup output token_expired more stuff');
      jest.advanceTimersByTime(100);

      fakePty.emitExit(0);

      const result = await promise;

      expect(result.error).toBe('auth_required');
    });

    it('should handle authentication_error type in output', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitData('"type":"authentication_error"');
      jest.advanceTimersByTime(100);

      const result = await promise;

      expect(result.error).toBe('auth_required');
    });

    it('should resolve with data on timeout if usage data was captured', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      // Emit usage data with "Current session" indicator
      fakePty.emitData('Current session\n  50% used\n  Resets in 1h 30m\n');
      jest.advanceTimersByTime(100);

      // Let timeout fire - should resolve because data includes "Current session"
      jest.advanceTimersByTime(45000);

      const result = await promise;

      // Should have parsed successfully since output contained "Current session"
      expect(result.usage).toBeDefined();
      expect(result.usage!.sessionPercentage).toBe(50);
    });

    it('should send /usage command when REPL prompt is detected', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      // Simulate REPL ready
      fakePty.emitData('? for shortcuts');
      jest.advanceTimersByTime(100);

      // Wait for the 1500ms delay before command is sent
      jest.advanceTimersByTime(1500);

      expect(fakePty.write).toHaveBeenCalledWith('/usage\r');
    });

    it('should send escape key after seeing usage data', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      // Emit usage data
      fakePty.emitData('Current session\n  50% used\n');
      jest.advanceTimersByTime(100);

      // Wait for the 3000ms delay before escape is sent
      jest.advanceTimersByTime(3000);

      expect(fakePty.write).toHaveBeenCalledWith('\x1b');
    });

    it('should handle trust dialog by sending enter', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      fakePty.emitData('Do you want to work in this folder?');
      jest.advanceTimersByTime(100);

      // Wait for the 1000ms delay before enter is sent
      jest.advanceTimersByTime(1000);

      expect(fakePty.write).toHaveBeenCalledWith('\r');
    });

    it('should detect REPL prompt with Opus/Sonnet model text', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      // Opus + Claude API indicates REPL is ready
      fakePty.emitData('Using Opus model via Claude API');
      jest.advanceTimersByTime(100);

      jest.advanceTimersByTime(1500);

      expect(fakePty.write).toHaveBeenCalledWith('/usage\r');
    });

    it('should send follow-up enter after /usage command', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      fakePty.emitData('? for shortcuts');
      jest.advanceTimersByTime(100);

      // 1500ms for /usage command
      jest.advanceTimersByTime(1500);
      expect(fakePty.write).toHaveBeenCalledWith('/usage\r');

      // 1200ms for follow-up enter
      jest.advanceTimersByTime(1200);
      expect(fakePty.write).toHaveBeenCalledWith('\r');
    });
  });

  // ================================================================
  // Parsing logic (tested through fetchUsageData)
  // ================================================================
  describe('usage output parsing', () => {
    /**
     * Helper: set up a fake PTY that emits the given output and exits.
     * Returns the result promise.
     */
    function fetchWithOutput(output: string) {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitData(output);
      jest.advanceTimersByTime(100);
      fakePty.emitExit(0);

      return promise;
    }

    describe('session parsing', () => {
      it('should parse "X% used" format', async () => {
        const result = await fetchWithOutput('Current session\n  25% used\n  Resets in 3h 10m\n');

        expect(result.usage!.sessionPercentage).toBe(25);
      });

      it('should parse "X% left" format (convert to used)', async () => {
        const result = await fetchWithOutput('Current session\n  75% left\n  Resets in 2h\n');

        // 75% left = 25% used
        expect(result.usage!.sessionPercentage).toBe(25);
      });

      it('should parse "X% remaining" format (convert to used)', async () => {
        const result = await fetchWithOutput(
          'Current session\n  60% remaining\n  Resets in 1h 45m\n'
        );

        // 60% remaining = 40% used
        expect(result.usage!.sessionPercentage).toBe(40);
      });

      it('should default to 0% when no percentage is found', async () => {
        const result = await fetchWithOutput('Current session\n  No usage data\n');

        expect(result.usage!.sessionPercentage).toBe(0);
      });
    });

    describe('weekly parsing', () => {
      it('should parse weekly all-models usage', async () => {
        const result = await fetchWithOutput(
          'Current week (all models)\n  55% used\n  Resets Dec 30 at 12pm\n'
        );

        expect(result.usage!.weeklyPercentage).toBe(55);
      });

      it('should default weekly to 0 when section is missing', async () => {
        const result = await fetchWithOutput('Current session\n  10% used\n');

        expect(result.usage!.weeklyPercentage).toBe(0);
      });
    });

    describe('sonnet/opus parsing', () => {
      it('should parse "Current week (Sonnet only)" section', async () => {
        const result = await fetchWithOutput(
          'Current week (Sonnet only)\n  30% used\n  Resets Jan 5 at 10am\n'
        );

        expect(result.usage!.sonnetWeeklyPercentage).toBe(30);
      });

      it('should parse "Current week (Sonnet)" as fallback', async () => {
        const result = await fetchWithOutput('Current week (Sonnet)\n  15% used\n');

        expect(result.usage!.sonnetWeeklyPercentage).toBe(15);
      });

      it('should parse "Current week (Opus)" as fallback', async () => {
        const result = await fetchWithOutput('Current week (Opus)\n  45% used\n');

        expect(result.usage!.sonnetWeeklyPercentage).toBe(45);
      });

      it('should default sonnet to 0 when no section matches', async () => {
        const result = await fetchWithOutput('Current session\n  10% used\n');

        expect(result.usage!.sonnetWeeklyPercentage).toBe(0);
      });
    });

    describe('reset time parsing', () => {
      it('should parse "Resets in Xh Ym" duration format', async () => {
        const result = await fetchWithOutput('Current session\n  25% used\n  Resets in 2h 15m\n');

        expect(result.usage!.sessionResetTime).toBeDefined();
        // The reset time should be approximately 2h15m from now
        const resetDate = new Date(result.usage!.sessionResetTime);
        const now = new Date();
        const diffMs = resetDate.getTime() - now.getTime();
        const diffMinutes = diffMs / (60 * 1000);
        // Allow some tolerance for processing time
        expect(diffMinutes).toBeGreaterThan(130);
        expect(diffMinutes).toBeLessThan(140);
      });

      it('should parse "Resets in Xh" (hours only)', async () => {
        const result = await fetchWithOutput('Current session\n  50% used\n  Resets in 3h\n');

        const resetDate = new Date(result.usage!.sessionResetTime);
        const now = new Date();
        const diffHours = (resetDate.getTime() - now.getTime()) / (60 * 60 * 1000);
        expect(diffHours).toBeGreaterThan(2.9);
        expect(diffHours).toBeLessThan(3.1);
      });

      it('should parse "Resets in Xm" (minutes only)', async () => {
        const result = await fetchWithOutput('Current session\n  80% used\n  Resets in 45m\n');

        const resetDate = new Date(result.usage!.sessionResetTime);
        const now = new Date();
        const diffMinutes = (resetDate.getTime() - now.getTime()) / (60 * 1000);
        expect(diffMinutes).toBeGreaterThan(40);
        expect(diffMinutes).toBeLessThan(50);
      });

      it('should parse "Resets Dec 22 at 8pm" date format', async () => {
        const result = await fetchWithOutput(
          'Current week (all models)\n  40% used\n  Resets Dec 22 at 8pm\n'
        );

        expect(result.usage!.weeklyResetTime).toBeDefined();
        const resetDate = new Date(result.usage!.weeklyResetTime);
        expect(resetDate.getMonth()).toBe(11); // December = 11
        expect(resetDate.getDate()).toBe(22);
        expect(resetDate.getHours()).toBe(20); // 8pm
      });

      it('should parse "Resets Jan 5 at 10:30am" date format with minutes', async () => {
        const result = await fetchWithOutput(
          'Current week (all models)\n  40% used\n  Resets Jan 5 at 10:30am\n'
        );

        const resetDate = new Date(result.usage!.weeklyResetTime);
        expect(resetDate.getMonth()).toBe(0); // January = 0
        expect(resetDate.getDate()).toBe(5);
        expect(resetDate.getHours()).toBe(10);
        expect(resetDate.getMinutes()).toBe(30);
      });

      it('should parse "Resets 11am" simple time format', async () => {
        const result = await fetchWithOutput('Current session\n  50% used\n  Resets 11am\n');

        const resetDate = new Date(result.usage!.sessionResetTime);
        expect(resetDate.getHours()).toBe(11);
        expect(resetDate.getMinutes()).toBe(0);
      });

      it('should parse "Resets 12pm" correctly (noon)', async () => {
        const result = await fetchWithOutput('Current session\n  50% used\n  Resets 12pm\n');

        const resetDate = new Date(result.usage!.sessionResetTime);
        expect(resetDate.getHours()).toBe(12);
      });

      it('should parse "Resets 12am" correctly (midnight)', async () => {
        const result = await fetchWithOutput('Current session\n  50% used\n  Resets 12am\n');

        const resetDate = new Date(result.usage!.sessionResetTime);
        expect(resetDate.getHours()).toBe(0);
      });

      it('should strip timezone suffix from reset text', async () => {
        const result = await fetchWithOutput(
          'Current session\n  25% used\n  Resets in 2h 15m (America/New_York)\n'
        );

        // The resetText should not contain the timezone suffix
        expect(result.usage!.sessionResetText).not.toContain('America/New_York');
      });

      it('should provide default reset time when no reset info found', async () => {
        const result = await fetchWithOutput('Current session\n  25% used\n');

        // Should still have a reset time (default)
        expect(result.usage!.sessionResetTime).toBeDefined();
        const resetDate = new Date(result.usage!.sessionResetTime);
        expect(resetDate.getTime()).toBeGreaterThan(Date.now());
      });

      it('should default session reset to ~5 hours from now', async () => {
        const result = await fetchWithOutput('Current session\n  25% used\n');

        const resetDate = new Date(result.usage!.sessionResetTime);
        const now = new Date();
        const diffHours = (resetDate.getTime() - now.getTime()) / (60 * 60 * 1000);
        expect(diffHours).toBeGreaterThan(4.9);
        expect(diffHours).toBeLessThan(5.1);
      });

      it('should default weekly reset to next Monday around noon', async () => {
        const result = await fetchWithOutput('Current week (all models)\n  25% used\n');

        const resetDate = new Date(result.usage!.weeklyResetTime);
        // Should be a Monday (day 1)
        expect(resetDate.getDay()).toBe(1);
        expect(resetDate.getHours()).toBe(12);
        expect(resetDate.getMinutes()).toBe(59);
      });
    });

    describe('section finding (last occurrence)', () => {
      it('should use the LAST occurrence of a section when multiple exist', async () => {
        // Terminal output often has multiple screen refreshes
        const output = ['Current session', '  10% used', 'Current session', '  50% used'].join(
          '\n'
        );

        const result = await fetchWithOutput(output);

        // Should use the last occurrence (50%, not 10%)
        expect(result.usage!.sessionPercentage).toBe(50);
      });
    });

    describe('ANSI code stripping', () => {
      it('should strip ANSI escape codes from output', async () => {
        const ansiOutput = '\x1B[1m\x1B[32mCurrent session\x1B[0m\n  \x1B[33m25% used\x1B[0m\n';
        const result = await fetchWithOutput(ansiOutput);

        expect(result.usage!.sessionPercentage).toBe(25);
      });

      it('should handle carriage returns in output', async () => {
        const crOutput = 'Current session\r\n  25% used\r\n';
        const result = await fetchWithOutput(crOutput);

        expect(result.usage!.sessionPercentage).toBe(25);
      });

      it('should handle OSC sequences', async () => {
        const oscOutput = '\x1B]0;Claude CLI\x07Current session\n  30% used\n';
        const result = await fetchWithOutput(oscOutput);

        expect(result.usage!.sessionPercentage).toBe(30);
      });
    });

    describe('complete output scenarios', () => {
      it('should parse a full realistic usage output', async () => {
        const fullOutput = [
          'Welcome back! Claude API (Opus)',
          '? for shortcuts',
          '',
          'Current session',
          '  25% used',
          '  Resets in 2h 15m',
          '',
          'Current week (all models)',
          '  40% used',
          '  Resets Dec 30 at 7:59pm',
          '',
          'Current week (Sonnet only)',
          '  10% used',
          '  Resets Dec 27 at 9:59am',
        ].join('\n');

        const result = await fetchWithOutput(fullOutput);

        expect(result.usage!.sessionPercentage).toBe(25);
        expect(result.usage!.weeklyPercentage).toBe(40);
        expect(result.usage!.sonnetWeeklyPercentage).toBe(10);
        expect(result.usage!.lastUpdated).toBeDefined();
        expect(result.usage!.userTimezone).toBeDefined();
      });

      it('should handle output with only session data', async () => {
        const result = await fetchWithOutput('Current session\n  90% used\n  Resets in 30m\n');

        expect(result.usage!.sessionPercentage).toBe(90);
        expect(result.usage!.weeklyPercentage).toBe(0);
        expect(result.usage!.sonnetWeeklyPercentage).toBe(0);
      });

      it('should handle 0% usage', async () => {
        const result = await fetchWithOutput('Current session\n  0% used\n');

        expect(result.usage!.sessionPercentage).toBe(0);
      });

      it('should handle 100% usage', async () => {
        const result = await fetchWithOutput('Current session\n  100% used\n');

        expect(result.usage!.sessionPercentage).toBe(100);
      });

      it('should handle 0% left (100% used)', async () => {
        const result = await fetchWithOutput('Current session\n  0% left\n');

        // 0% left = 100% used
        expect(result.usage!.sessionPercentage).toBe(100);
      });

      it('should set lastUpdated as ISO string', async () => {
        const result = await fetchWithOutput('Current session\n  10% used\n');

        expect(result.usage!.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('should set userTimezone', async () => {
        const result = await fetchWithOutput('Current session\n  10% used\n');

        expect(typeof result.usage!.userTimezone).toBe('string');
        expect(result.usage!.userTimezone.length).toBeGreaterThan(0);
      });
    });

    describe('reset text cleaning', () => {
      it('should strip percentage from reset text', async () => {
        // When percentage and reset are on the same line
        const result = await fetchWithOutput('Current session\n  25% used  Resets in 2h 15m\n');

        // resetText should not contain the percentage part
        if (result.usage!.sessionResetText) {
          expect(result.usage!.sessionResetText).not.toMatch(/\d+%/);
        }
      });

      it('should fix missing space between "Resets" and number', async () => {
        const result = await fetchWithOutput('Current session\n  25% used\n  Resets2h 15m\n');

        // The parser should handle "Resets2h" by inserting a space
        if (result.usage!.sessionResetText) {
          expect(result.usage!.sessionResetText).toMatch(/Resets?\s+\d/);
        }
      });
    });
  });

  // ================================================================
  // Edge cases and error handling
  // ================================================================
  describe('edge cases', () => {
    it('should handle non-Error thrown objects in fetchUsageData', async () => {
      mockPtySpawn.mockImplementation(() => {
        throw 'string error';
      });

      const result = await service.fetchUsageData('/project');

      expect(result.error).toBeDefined();
      expect(result.message).toContain('string error');
    });

    it('should handle empty string output on exit', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitData('');
      fakePty.emitExit(0);

      const result = await promise;

      expect(result.error).toBeDefined();
    });

    it('should not send /usage command twice', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      // First REPL prompt
      fakePty.emitData('? for shortcuts');
      jest.advanceTimersByTime(1500);

      // Second REPL prompt (shouldn't trigger another /usage)
      fakePty.emitData('? for shortcuts again');
      jest.advanceTimersByTime(1500);

      const usageCalls = fakePty.write.mock.calls.filter(
        (call: unknown[]) => call[0] === '/usage\r'
      );
      expect(usageCalls).toHaveLength(1);
    });

    it('should not approve trust dialog twice', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      // First trust prompt
      fakePty.emitData('Do you want to work in this folder?');
      jest.advanceTimersByTime(1000);

      // Second trust prompt (shouldn't trigger another enter)
      fakePty.emitData('Do you want to work in this folder?');
      jest.advanceTimersByTime(1000);

      const enterCalls = fakePty.write.mock.calls.filter((call: unknown[]) => call[0] === '\r');
      expect(enterCalls).toHaveLength(1);
    });

    it('should handle authentication_error with spaces in JSON', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      const promise = service.fetchUsageData('/project');

      fakePty.emitData('"type": "authentication_error"');
      jest.advanceTimersByTime(100);

      const result = await promise;

      expect(result.error).toBe('auth_required');
    });

    it('should handle login error message', async () => {
      mockPtySpawn.mockImplementation(() => {
        throw new Error('Please run claude login first');
      });

      const result = await service.fetchUsageData('/project');

      expect(result.error).toBe('auth_required');
    });

    it('should detect "Ready to code here" trust prompt variant', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      fakePty.emitData('Ready to code here');
      jest.advanceTimersByTime(1000);

      expect(fakePty.write).toHaveBeenCalledWith('\r');
    });

    it('should detect "permission to work with your files" trust prompt variant', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      fakePty.emitData('permission to work with your files');
      jest.advanceTimersByTime(1000);

      expect(fakePty.write).toHaveBeenCalledWith('\r');
    });

    it('should detect REPL via Welcome back message', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      fakePty.emitData('Welcome back, user! Claude is ready.');
      jest.advanceTimersByTime(1500);

      expect(fakePty.write).toHaveBeenCalledWith('/usage\r');
    });

    it('should detect REPL via Sonnet + Claude API text', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      fakePty.emitData('Claude API Sonnet model loaded');
      jest.advanceTimersByTime(1500);

      expect(fakePty.write).toHaveBeenCalledWith('/usage\r');
    });
  });

  // ================================================================
  // PTY options and environment
  // ================================================================
  describe('PTY configuration', () => {
    it('should pass correct PTY options', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/my/project');

      // Let things settle
      jest.advanceTimersByTime(100);
      fakePty.emitExit(0);

      expect(mockPtySpawn).toHaveBeenCalledWith(
        expect.any(String), // shell
        expect.any(Array), // args
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd: '/my/project',
          env: expect.objectContaining({
            TERM: 'xterm-256color',
          }),
        })
      );
    });

    it('should include process.env variables in PTY env (filtering undefined)', async () => {
      const fakePty = createFakePty();
      mockPtySpawn.mockReturnValue(fakePty);

      service.fetchUsageData('/project');

      jest.advanceTimersByTime(100);
      fakePty.emitExit(0);

      const ptyOptions = mockPtySpawn.mock.calls[0][2];
      // Should have inherited env vars
      expect(ptyOptions.env).toBeDefined();
      // NODE_ENV should be inherited from process.env (set to 'test' by setup)
      expect(ptyOptions.env.NODE_ENV).toBe('test');
    });
  });

  // ================================================================
  // Concurrent calls
  // ================================================================
  describe('concurrent status calls', () => {
    it('should share cached status across concurrent getStatus calls', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = createFakeProc();
        setTimeout(() => proc.emitClose(1), 0);
        return proc;
      });

      // First call populates cache
      const first = await service.getStatus();

      mockSpawn.mockClear();

      // Second call should use cache
      const second = await service.getStatus();

      expect(second).toEqual(first);
      expect(mockSpawn).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Cross-platform behavior
  // ================================================================
  describe('cross-platform behavior', () => {
    describe('Windows platform', () => {
      let winService: UsageService;

      beforeEach(async () => {
        jest.clearAllMocks();
        jest.useFakeTimers({ advanceTimers: true });
        mockOsPlatform.mockReturnValue('win32');

        const module: TestingModule = await Test.createTestingModule({
          providers: [UsageService],
        }).compile();

        winService = module.get<UsageService>(UsageService);
      });

      afterEach(() => {
        jest.useRealTimers();
        mockOsPlatform.mockReturnValue(process.platform);
      });

      it('should use "where" to check CLI availability', async () => {
        const fakeProc = createFakeProc();
        mockSpawn.mockReturnValue(fakeProc);

        const promise = winService.isAvailable();
        fakeProc.emitClose(0);
        await promise;

        expect(mockSpawn.mock.calls[0][0]).toBe('where');
        expect(mockSpawn.mock.calls[0][1]).toEqual(['claude']);
      });

      it('should use cmd.exe as shell for PTY commands', async () => {
        const fakePty = createFakePty();
        mockPtySpawn.mockReturnValue(fakePty);

        winService.fetchUsageData('/project');

        jest.advanceTimersByTime(100);
        fakePty.emitExit(0);

        const shell = mockPtySpawn.mock.calls[0][0];
        expect(shell).toBe('cmd.exe');
      });

      it('should use /c flag for cmd.exe args', async () => {
        const fakePty = createFakePty();
        mockPtySpawn.mockReturnValue(fakePty);

        winService.fetchUsageData('/project');

        jest.advanceTimersByTime(100);
        fakePty.emitExit(0);

        const args = mockPtySpawn.mock.calls[0][1] as string[];
        expect(args[0]).toBe('/c');
      });

      it('should disable ConPTY on Windows', async () => {
        const fakePty = createFakePty();
        mockPtySpawn.mockReturnValue(fakePty);

        winService.fetchUsageData('/project');

        jest.advanceTimersByTime(100);
        fakePty.emitExit(0);

        const ptyOptions = mockPtySpawn.mock.calls[0][2];
        expect(ptyOptions.useConpty).toBe(false);
      });

      it('should use "where" for path lookup in getStatus', async () => {
        mockSpawn.mockImplementation(() => {
          const proc = createFakeProc();
          setTimeout(() => proc.emitClose(0), 0);
          return proc;
        });
        mockExecSync.mockReturnValue('claude.cmd\n');

        const status = await winService.getStatus();

        // The second execSync call should use "where"
        const pathCalls = mockExecSync.mock.calls.filter(
          (call: unknown[]) => !(call[0] as string).includes('--version')
        );
        if (pathCalls.length > 0) {
          expect(pathCalls[0][0] as string).toContain('where');
        }
        expect(status.platform).toBe('win32');
      });
    });

    describe('Linux platform', () => {
      let linuxService: UsageService;

      beforeEach(async () => {
        jest.clearAllMocks();
        jest.useFakeTimers({ advanceTimers: true });
        mockOsPlatform.mockReturnValue('linux');

        const module: TestingModule = await Test.createTestingModule({
          providers: [UsageService],
        }).compile();

        linuxService = module.get<UsageService>(UsageService);
      });

      afterEach(() => {
        jest.useRealTimers();
        mockOsPlatform.mockReturnValue(process.platform);
      });

      it('should use "which" to check CLI availability', async () => {
        const fakeProc = createFakeProc();
        mockSpawn.mockReturnValue(fakeProc);

        const promise = linuxService.isAvailable();
        fakeProc.emitClose(0);
        await promise;

        expect(mockSpawn.mock.calls[0][0]).toBe('which');
      });

      it('should use /bin/sh as shell for PTY commands', async () => {
        const fakePty = createFakePty();
        mockPtySpawn.mockReturnValue(fakePty);

        linuxService.fetchUsageData('/project');

        jest.advanceTimersByTime(100);
        fakePty.emitExit(0);

        const shell = mockPtySpawn.mock.calls[0][0];
        expect(shell).toBe('/bin/sh');
      });

      it('should use -c flag for sh args', async () => {
        const fakePty = createFakePty();
        mockPtySpawn.mockReturnValue(fakePty);

        linuxService.fetchUsageData('/project');

        jest.advanceTimersByTime(100);
        fakePty.emitExit(0);

        const args = mockPtySpawn.mock.calls[0][1] as string[];
        expect(args[0]).toBe('-c');
      });

      it('should NOT set useConpty on Linux', async () => {
        const fakePty = createFakePty();
        mockPtySpawn.mockReturnValue(fakePty);

        linuxService.fetchUsageData('/project');

        jest.advanceTimersByTime(100);
        fakePty.emitExit(0);

        const ptyOptions = mockPtySpawn.mock.calls[0][2];
        expect(ptyOptions.useConpty).toBeUndefined();
      });

      it('should use "which" for path lookup in getStatus', async () => {
        mockSpawn.mockImplementation(() => {
          const proc = createFakeProc();
          setTimeout(() => proc.emitClose(0), 0);
          return proc;
        });
        mockExecSync.mockReturnValue('/usr/local/bin/claude\n');

        const status = await linuxService.getStatus();

        const pathCalls = mockExecSync.mock.calls.filter(
          (call: unknown[]) => !(call[0] as string).includes('--version')
        );
        if (pathCalls.length > 0) {
          expect(pathCalls[0][0] as string).toContain('which');
        }
        expect(status.platform).toBe('linux');
      });
    });
  });
});
