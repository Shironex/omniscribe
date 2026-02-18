import { stripAnsiCodes } from '@omniscribe/shared';
import { UsageOutputParser } from './usage-output-parser';

describe('UsageOutputParser', () => {
  let parser: UsageOutputParser;

  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    parser = new UsageOutputParser();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ================================================================
  // stripAnsiCodes()
  // ================================================================
  describe('stripAnsiCodes', () => {
    it('should strip CSI escape sequences', () => {
      const input = '\x1B[1m\x1B[32mCurrent session\x1B[0m';
      expect(stripAnsiCodes(input)).toBe('Current session');
    });

    it('should handle carriage returns', () => {
      const input = 'Current session\r\n  25% used\r\n';
      const result = stripAnsiCodes(input);
      expect(result).toContain('Current session\n');
      expect(result).toContain('25% used');
    });

    it('should strip OSC sequences', () => {
      const input = '\x1B]0;Claude CLI\x07Current session';
      expect(stripAnsiCodes(input)).toBe('Current session');
    });

    it('should handle backspaces', () => {
      const input = 'ab\x08c';
      expect(stripAnsiCodes(input)).toBe('ac');
    });

    it('should strip remaining control characters except newline', () => {
      const input = 'hello\x00\x01\x02world';
      expect(stripAnsiCodes(input)).toBe('helloworld');
    });
  });

  // ================================================================
  // parseUsageOutput() — session parsing
  // ================================================================
  describe('session parsing', () => {
    it('should parse "X% used" format', () => {
      const usage = parser.parseUsageOutput('Current session\n  25% used\n  Resets in 3h 10m\n');
      expect(usage.sessionPercentage).toBe(25);
    });

    it('should parse "X% left" format (convert to used)', () => {
      const usage = parser.parseUsageOutput('Current session\n  75% left\n  Resets in 2h\n');
      // 75% left = 25% used
      expect(usage.sessionPercentage).toBe(25);
    });

    it('should parse "X% remaining" format (convert to used)', () => {
      const usage = parser.parseUsageOutput(
        'Current session\n  60% remaining\n  Resets in 1h 45m\n'
      );
      // 60% remaining = 40% used
      expect(usage.sessionPercentage).toBe(40);
    });

    it('should default to 0% when no percentage is found', () => {
      const usage = parser.parseUsageOutput('Current session\n  No usage data\n');
      expect(usage.sessionPercentage).toBe(0);
    });
  });

  // ================================================================
  // parseUsageOutput() — weekly parsing
  // ================================================================
  describe('weekly parsing', () => {
    it('should parse weekly all-models usage', () => {
      const usage = parser.parseUsageOutput(
        'Current week (all models)\n  55% used\n  Resets Dec 30 at 12pm\n'
      );
      expect(usage.weeklyPercentage).toBe(55);
    });

    it('should default weekly to 0 when section is missing', () => {
      const usage = parser.parseUsageOutput('Current session\n  10% used\n');
      expect(usage.weeklyPercentage).toBe(0);
    });
  });

  // ================================================================
  // parseUsageOutput() — sonnet/opus parsing
  // ================================================================
  describe('sonnet/opus parsing', () => {
    it('should parse "Current week (Sonnet only)" section', () => {
      const usage = parser.parseUsageOutput(
        'Current week (Sonnet only)\n  30% used\n  Resets Jan 5 at 10am\n'
      );
      expect(usage.sonnetWeeklyPercentage).toBe(30);
    });

    it('should parse "Current week (Sonnet)" as fallback', () => {
      const usage = parser.parseUsageOutput('Current week (Sonnet)\n  15% used\n');
      expect(usage.sonnetWeeklyPercentage).toBe(15);
    });

    it('should parse "Current week (Opus)" as fallback', () => {
      const usage = parser.parseUsageOutput('Current week (Opus)\n  45% used\n');
      expect(usage.sonnetWeeklyPercentage).toBe(45);
    });

    it('should default sonnet to 0 when no section matches', () => {
      const usage = parser.parseUsageOutput('Current session\n  10% used\n');
      expect(usage.sonnetWeeklyPercentage).toBe(0);
    });
  });

  // ================================================================
  // parseUsageOutput() — reset time parsing
  // ================================================================
  describe('reset time parsing', () => {
    it('should parse "Resets in Xh Ym" duration format', () => {
      const usage = parser.parseUsageOutput('Current session\n  25% used\n  Resets in 2h 15m\n');

      expect(usage.sessionResetTime).toBeDefined();
      const resetDate = new Date(usage.sessionResetTime);
      const now = new Date();
      const diffMinutes = (resetDate.getTime() - now.getTime()) / (60 * 1000);
      expect(diffMinutes).toBeGreaterThan(130);
      expect(diffMinutes).toBeLessThan(140);
    });

    it('should parse "Resets in Xh" (hours only)', () => {
      const usage = parser.parseUsageOutput('Current session\n  50% used\n  Resets in 3h\n');

      const resetDate = new Date(usage.sessionResetTime);
      const now = new Date();
      const diffHours = (resetDate.getTime() - now.getTime()) / (60 * 60 * 1000);
      expect(diffHours).toBeGreaterThan(2.9);
      expect(diffHours).toBeLessThan(3.1);
    });

    it('should parse "Resets in Xm" (minutes only)', () => {
      const usage = parser.parseUsageOutput('Current session\n  80% used\n  Resets in 45m\n');

      const resetDate = new Date(usage.sessionResetTime);
      const now = new Date();
      const diffMinutes = (resetDate.getTime() - now.getTime()) / (60 * 1000);
      expect(diffMinutes).toBeGreaterThan(40);
      expect(diffMinutes).toBeLessThan(50);
    });

    it('should parse "Resets Dec 22 at 8pm" date format', () => {
      const usage = parser.parseUsageOutput(
        'Current week (all models)\n  40% used\n  Resets Dec 22 at 8pm\n'
      );

      expect(usage.weeklyResetTime).toBeDefined();
      const resetDate = new Date(usage.weeklyResetTime);
      expect(resetDate.getMonth()).toBe(11); // December = 11
      expect(resetDate.getDate()).toBe(22);
      expect(resetDate.getHours()).toBe(20); // 8pm
    });

    it('should parse "Resets Jan 5 at 10:30am" date format with minutes', () => {
      const usage = parser.parseUsageOutput(
        'Current week (all models)\n  40% used\n  Resets Jan 5 at 10:30am\n'
      );

      const resetDate = new Date(usage.weeklyResetTime);
      expect(resetDate.getMonth()).toBe(0); // January = 0
      expect(resetDate.getDate()).toBe(5);
      expect(resetDate.getHours()).toBe(10);
      expect(resetDate.getMinutes()).toBe(30);
    });

    it('should parse "Resets 11am" simple time format', () => {
      const usage = parser.parseUsageOutput('Current session\n  50% used\n  Resets 11am\n');

      const resetDate = new Date(usage.sessionResetTime);
      expect(resetDate.getHours()).toBe(11);
      expect(resetDate.getMinutes()).toBe(0);
    });

    it('should parse "Resets 12pm" correctly (noon)', () => {
      const usage = parser.parseUsageOutput('Current session\n  50% used\n  Resets 12pm\n');

      const resetDate = new Date(usage.sessionResetTime);
      expect(resetDate.getHours()).toBe(12);
    });

    it('should parse "Resets 12am" correctly (midnight)', () => {
      const usage = parser.parseUsageOutput('Current session\n  50% used\n  Resets 12am\n');

      const resetDate = new Date(usage.sessionResetTime);
      expect(resetDate.getHours()).toBe(0);
    });

    it('should strip timezone suffix from reset text', () => {
      const usage = parser.parseUsageOutput(
        'Current session\n  25% used\n  Resets in 2h 15m (America/New_York)\n'
      );

      expect(usage.sessionResetText).not.toContain('America/New_York');
    });

    it('should provide default reset time when no reset info found', () => {
      const usage = parser.parseUsageOutput('Current session\n  25% used\n');

      expect(usage.sessionResetTime).toBeDefined();
      const resetDate = new Date(usage.sessionResetTime);
      expect(resetDate.getTime()).toBeGreaterThan(Date.now());
    });

    it('should default session reset to ~5 hours from now', () => {
      const usage = parser.parseUsageOutput('Current session\n  25% used\n');

      const resetDate = new Date(usage.sessionResetTime);
      const now = new Date();
      const diffHours = (resetDate.getTime() - now.getTime()) / (60 * 60 * 1000);
      expect(diffHours).toBeGreaterThan(4.9);
      expect(diffHours).toBeLessThan(5.1);
    });

    it('should default weekly reset to next Monday around noon', () => {
      const usage = parser.parseUsageOutput('Current week (all models)\n  25% used\n');

      const resetDate = new Date(usage.weeklyResetTime);
      // Should be a Monday (day 1)
      expect(resetDate.getDay()).toBe(1);
      expect(resetDate.getHours()).toBe(12);
      expect(resetDate.getMinutes()).toBe(59);
    });
  });

  // ================================================================
  // parseUsageOutput() — section finding
  // ================================================================
  describe('section finding (last occurrence)', () => {
    it('should use the LAST occurrence of a section when multiple exist', () => {
      // Terminal output often has multiple screen refreshes
      const output = ['Current session', '  10% used', 'Current session', '  50% used'].join('\n');

      const usage = parser.parseUsageOutput(output);

      // Should use the last occurrence (50%, not 10%)
      expect(usage.sessionPercentage).toBe(50);
    });
  });

  // ================================================================
  // parseUsageOutput() — ANSI codes in full output
  // ================================================================
  describe('ANSI code handling in parsing', () => {
    it('should strip ANSI escape codes from output before parsing', () => {
      const ansiOutput = '\x1B[1m\x1B[32mCurrent session\x1B[0m\n  \x1B[33m25% used\x1B[0m\n';
      const usage = parser.parseUsageOutput(ansiOutput);
      expect(usage.sessionPercentage).toBe(25);
    });

    it('should handle carriage returns in output', () => {
      const crOutput = 'Current session\r\n  25% used\r\n';
      const usage = parser.parseUsageOutput(crOutput);
      expect(usage.sessionPercentage).toBe(25);
    });

    it('should handle OSC sequences in output', () => {
      const oscOutput = '\x1B]0;Claude CLI\x07Current session\n  30% used\n';
      const usage = parser.parseUsageOutput(oscOutput);
      expect(usage.sessionPercentage).toBe(30);
    });
  });

  // ================================================================
  // parseUsageOutput() — complete output scenarios
  // ================================================================
  describe('complete output scenarios', () => {
    it('should parse a full realistic usage output', () => {
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

      const usage = parser.parseUsageOutput(fullOutput);

      expect(usage.sessionPercentage).toBe(25);
      expect(usage.weeklyPercentage).toBe(40);
      expect(usage.sonnetWeeklyPercentage).toBe(10);
      expect(usage.lastUpdated).toBeDefined();
      expect(usage.userTimezone).toBeDefined();
    });

    it('should handle output with only session data', () => {
      const usage = parser.parseUsageOutput('Current session\n  90% used\n  Resets in 30m\n');

      expect(usage.sessionPercentage).toBe(90);
      expect(usage.weeklyPercentage).toBe(0);
      expect(usage.sonnetWeeklyPercentage).toBe(0);
    });

    it('should handle 0% usage', () => {
      const usage = parser.parseUsageOutput('Current session\n  0% used\n');
      expect(usage.sessionPercentage).toBe(0);
    });

    it('should handle 100% usage', () => {
      const usage = parser.parseUsageOutput('Current session\n  100% used\n');
      expect(usage.sessionPercentage).toBe(100);
    });

    it('should handle 0% left (100% used)', () => {
      const usage = parser.parseUsageOutput('Current session\n  0% left\n');
      // 0% left = 100% used
      expect(usage.sessionPercentage).toBe(100);
    });

    it('should set lastUpdated as ISO string', () => {
      const usage = parser.parseUsageOutput('Current session\n  10% used\n');
      expect(usage.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should set userTimezone', () => {
      const usage = parser.parseUsageOutput('Current session\n  10% used\n');
      expect(typeof usage.userTimezone).toBe('string');
      expect(usage.userTimezone.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // parseUsageOutput() — reset text cleaning
  // ================================================================
  describe('reset text cleaning', () => {
    it('should strip percentage from reset text', () => {
      // When percentage and reset are on the same line
      const usage = parser.parseUsageOutput('Current session\n  25% used  Resets in 2h 15m\n');

      expect(usage.sessionResetText).toBeTruthy();
      expect(usage.sessionResetText).not.toMatch(/\d+%/);
    });

    it('should fix missing space between "Resets" and number', () => {
      const usage = parser.parseUsageOutput('Current session\n  25% used\n  Resets2h 15m\n');

      expect(usage.sessionResetText).toBeTruthy();
      expect(usage.sessionResetText).toMatch(/Resets?\s+\d/);
    });
  });
});
