import type { ClaudeUsage } from '@omniscribe/shared';

// ---- Regex patterns ----

/** Matches percentage values: "25% used", "75% left", "60% remaining" */
const PERCENTAGE_REGEX = /(\d{1,3})\s*%\s*(left|used|remaining)/i;

/** Matches reset text: "Resets in 2h 15m", "Resets Dec 22 at 8pm" */
const RESET_TEXT_REGEX = /(Resets?.*)$/i;

/** Matches timezone suffix: "(America/New_York)" */
const TIMEZONE_SUFFIX_REGEX = /\s*\([A-Za-z_/]+\)\s*$/;

/** Matches missing space between "Resets" and a digit */
const MISSING_SPACE_REGEX = /(resets?)(\d)/i;

/** Matches duration format: "2h 15m", "3h", "45m", "2hours", "45min" */
const DURATION_REGEX = /(\d+)\s*h(?:ours?)?(?:\s+(\d+)\s*m(?:in)?)?|(\d+)\s*m(?:in)?/i;

/** Matches simple time format: "Resets 11am", "Resets 3:30pm" */
const SIMPLE_TIME_REGEX = /resets\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

/** Matches date format: "Resets Dec 22 at 8pm", "Jan 5 at 10:30am" */
const DATE_TIME_REGEX =
  /(?:resets\s*)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+at\s+|\s*,?\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

/** Month name to zero-based index */
const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsiCodes(text: string): string {
  /* eslint-disable no-control-regex */
  let clean = text
    // CSI sequences
    .replace(/\x1B\[[0-9;?]*[A-Za-z@]/g, '')
    // OSC sequences
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)?/g, '')
    // Other ESC sequences
    .replace(/\x1B[A-Za-z]/g, '')
    // Carriage returns
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Handle backspaces
  while (clean.includes('\x08')) {
    clean = clean.replace(/[^\x08]\x08/, '');
    clean = clean.replace(/^\x08+/, '');
  }

  // Strip remaining control characters (except newline)
  clean = clean.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '');
  /* eslint-enable no-control-regex */

  return clean;
}

/**
 * Parser for Claude CLI usage output.
 *
 * Extracts session/weekly/model usage percentages, reset times,
 * and reset text from raw CLI output.
 */
export class UsageOutputParser {
  /**
   * Parse the Claude CLI output to extract usage information
   */
  parseUsageOutput(rawOutput: string): ClaudeUsage {
    const output = stripAnsiCodes(rawOutput);
    const lines = output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l);

    // Parse session usage
    const sessionData = this.parseSection(lines, 'Current session', 'session');

    // Parse weekly usage (all models)
    const weeklyData = this.parseSection(lines, 'Current week (all models)', 'weekly');

    // Parse Sonnet/Opus usage - try different labels
    let sonnetData = this.parseSection(lines, 'Current week (Sonnet only)', 'sonnet');
    if (sonnetData.percentage === 0) {
      sonnetData = this.parseSection(lines, 'Current week (Sonnet)', 'sonnet');
    }
    if (sonnetData.percentage === 0) {
      sonnetData = this.parseSection(lines, 'Current week (Opus)', 'sonnet');
    }

    return {
      sessionPercentage: sessionData.percentage,
      sessionResetTime: sessionData.resetTime,
      sessionResetText: sessionData.resetText,

      weeklyPercentage: weeklyData.percentage,
      weeklyResetTime: weeklyData.resetTime,
      weeklyResetText: weeklyData.resetText,

      sonnetWeeklyPercentage: sonnetData.percentage,
      sonnetResetText: sonnetData.resetText,

      lastUpdated: new Date().toISOString(),
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  /**
   * Parse a section of the usage output
   */
  private parseSection(
    lines: string[],
    sectionLabel: string,
    type: string
  ): { percentage: number; resetTime: string; resetText: string } {
    let percentage: number | null = null;
    let resetTime = this.getDefaultResetTime(type);
    let resetText = '';

    // Find the LAST occurrence of the section (terminal output has multiple screen refreshes)
    let sectionIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].toLowerCase().includes(sectionLabel.toLowerCase())) {
        sectionIndex = i;
        break;
      }
    }

    if (sectionIndex === -1) {
      return { percentage: 0, resetTime, resetText };
    }

    // Look at the lines following the section header
    const searchWindow = lines.slice(sectionIndex, sectionIndex + 5);

    for (const line of searchWindow) {
      // Extract percentage
      if (percentage === null) {
        const percentMatch = line.match(PERCENTAGE_REGEX);
        if (percentMatch) {
          const value = parseInt(percentMatch[1], 10);
          const isUsed = percentMatch[2].toLowerCase() === 'used';
          // Convert "left" to "used" percentage
          percentage = isUsed ? value : 100 - value;
        }
      }

      // Extract reset time
      if (!resetText && line.toLowerCase().includes('reset')) {
        const match = line.match(RESET_TEXT_REGEX);
        if (match) {
          resetText = match[1];
        }
      }
    }

    // Parse the reset time if we found one
    if (resetText) {
      // Clean up resetText
      resetText = resetText.replace(PERCENTAGE_REGEX, '').trim();
      resetText = resetText.replace(MISSING_SPACE_REGEX, '$1 $2');

      resetTime = this.parseResetTime(resetText, type);
      // Strip timezone from display text
      resetText = resetText.replace(TIMEZONE_SUFFIX_REGEX, '').trim();
    }

    return { percentage: percentage ?? 0, resetTime, resetText };
  }

  /**
   * Parse reset time from text like "Resets in 2h 15m" or "Resets Dec 22 at 8pm"
   */
  private parseResetTime(text: string, type: string): string {
    const now = new Date();

    // Try duration format: "Resets in 2h 15m"
    const durationMatch = text.match(DURATION_REGEX);
    if (durationMatch) {
      let hours = 0;
      let minutes = 0;

      if (durationMatch[1]) {
        hours = parseInt(durationMatch[1], 10);
        minutes = durationMatch[2] ? parseInt(durationMatch[2], 10) : 0;
      } else if (durationMatch[3]) {
        minutes = parseInt(durationMatch[3], 10);
      }

      const resetDate = new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
      return resetDate.toISOString();
    }

    // Try simple time format: "Resets 11am"
    const simpleTimeMatch = text.match(SIMPLE_TIME_REGEX);
    if (simpleTimeMatch) {
      let hours = parseInt(simpleTimeMatch[1], 10);
      const minutes = simpleTimeMatch[2] ? parseInt(simpleTimeMatch[2], 10) : 0;
      const ampm = simpleTimeMatch[3].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      else if (ampm === 'am' && hours === 12) hours = 0;

      const resetDate = new Date(now);
      resetDate.setHours(hours, minutes, 0, 0);

      if (resetDate <= now) {
        resetDate.setDate(resetDate.getDate() + 1);
      }
      return resetDate.toISOString();
    }

    // Try date format: "Resets Dec 22 at 8pm"
    const dateMatch = text.match(DATE_TIME_REGEX);
    if (dateMatch) {
      const monthName = dateMatch[1];
      const day = parseInt(dateMatch[2], 10);
      let hours = parseInt(dateMatch[3], 10);
      const minutes = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0;
      const ampm = dateMatch[5].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      else if (ampm === 'am' && hours === 12) hours = 0;

      const month = MONTHS[monthName.toLowerCase().substring(0, 3)];

      if (month !== undefined) {
        const year = now.getFullYear();
        const resetDate = new Date(year, month, day, hours, minutes);
        if (resetDate < now) {
          resetDate.setFullYear(year + 1);
        }
        return resetDate.toISOString();
      }
    }

    return this.getDefaultResetTime(type);
  }

  /**
   * Get default reset time based on usage type
   */
  private getDefaultResetTime(type: string): string {
    const now = new Date();

    if (type === 'session') {
      // Session resets in ~5 hours
      return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString();
    } else {
      // Weekly resets on next Monday around noon
      const result = new Date(now);
      const currentDay = now.getDay();
      let daysUntilMonday = (1 + 7 - currentDay) % 7;
      if (daysUntilMonday === 0) daysUntilMonday = 7;
      result.setDate(result.getDate() + daysUntilMonday);
      result.setHours(12, 59, 0, 0);
      return result.toISOString();
    }
  }
}
