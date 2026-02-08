import { Test, TestingModule } from '@nestjs/testing';
import { UsageService } from './usage.service';
import type { ClaudeCliStatus } from '@omniscribe/shared';

// ---- Mocks ----

// Mock getClaudeCliStatus from claude-detection
const mockGetClaudeCliStatus = jest.fn<Promise<ClaudeCliStatus>, []>();
jest.mock('../../main/utils/claude-detection', () => ({
  getClaudeCliStatus: (...args: unknown[]) => mockGetClaudeCliStatus(...(args as [])),
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
  // getStatus()
  // ================================================================
  describe('getStatus', () => {
    const installedStatus: ClaudeCliStatus = {
      installed: true,
      version: '1.0.27',
      path: '/usr/local/bin/claude',
      method: 'path',
      platform: 'linux',
      arch: 'x64',
      auth: { authenticated: true },
    };

    const notInstalledStatus: ClaudeCliStatus = {
      installed: false,
      platform: 'win32',
      arch: 'x64',
      auth: { authenticated: false },
    };

    it('should return not-installed status when CLI is not found', async () => {
      mockGetClaudeCliStatus.mockResolvedValue(notInstalledStatus);

      const status = await service.getStatus();

      expect(status.installed).toBe(false);
      expect(status.auth.authenticated).toBe(false);
      expect(status.platform).toBeDefined();
      expect(status.arch).toBeDefined();
    });

    it('should return installed status with version and path when CLI is found', async () => {
      mockGetClaudeCliStatus.mockResolvedValue(installedStatus);

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.version).toBe('1.0.27');
      expect(status.path).toBe('/usr/local/bin/claude');
      expect(status.method).toBe('path');
      expect(status.auth.authenticated).toBe(true);
    });

    it('should return cached status on subsequent calls within TTL', async () => {
      mockGetClaudeCliStatus.mockResolvedValue(installedStatus);

      const first = await service.getStatus();

      // Clear mock - second call should NOT call getClaudeCliStatus again
      mockGetClaudeCliStatus.mockClear();

      const second = await service.getStatus();

      expect(second).toEqual(first);
      expect(mockGetClaudeCliStatus).not.toHaveBeenCalled();
    });

    it('should refresh when forceRefresh is true even within TTL', async () => {
      mockGetClaudeCliStatus.mockResolvedValue(installedStatus);
      await service.getStatus();

      // Force refresh with updated status
      const updatedStatus: ClaudeCliStatus = {
        ...installedStatus,
        version: '2.0.0',
      };
      mockGetClaudeCliStatus.mockClear();
      mockGetClaudeCliStatus.mockResolvedValue(updatedStatus);

      const refreshed = await service.getStatus(true);

      expect(mockGetClaudeCliStatus).toHaveBeenCalledTimes(1);
      expect(refreshed.version).toBe('2.0.0');
    });

    it('should refresh after cache TTL expires', async () => {
      mockGetClaudeCliStatus.mockResolvedValue(installedStatus);
      await service.getStatus();

      // Advance time past TTL (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      const updatedStatus: ClaudeCliStatus = {
        ...installedStatus,
        version: '2.0.0',
      };
      mockGetClaudeCliStatus.mockClear();
      mockGetClaudeCliStatus.mockResolvedValue(updatedStatus);

      const refreshed = await service.getStatus();

      expect(mockGetClaudeCliStatus).toHaveBeenCalledTimes(1);
      expect(refreshed.version).toBe('2.0.0');
    });

    it('should return unauthenticated when credentials not found', async () => {
      const unauthenticatedStatus: ClaudeCliStatus = {
        installed: true,
        version: '1.0.27',
        path: '/usr/local/bin/claude',
        method: 'path',
        platform: 'linux',
        arch: 'x64',
        auth: { authenticated: false },
      };
      mockGetClaudeCliStatus.mockResolvedValue(unauthenticatedStatus);

      const status = await service.getStatus();

      expect(status.installed).toBe(true);
      expect(status.auth.authenticated).toBe(false);
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
      mockGetClaudeCliStatus.mockResolvedValue({
        installed: false,
        platform: 'linux',
        arch: 'x64',
        auth: { authenticated: false },
      });

      // First call populates cache
      const first = await service.getStatus();

      mockGetClaudeCliStatus.mockClear();

      // Second call should use cache
      const second = await service.getStatus();

      expect(second).toEqual(first);
      expect(mockGetClaudeCliStatus).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // Cross-platform behavior (PTY only - CLI detection is in claude-detection.ts)
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
    });
  });
});
