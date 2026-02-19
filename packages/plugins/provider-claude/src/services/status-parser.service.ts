/**
 * Claude Status Parser Service
 *
 * Parses terminal output from Claude Code to detect session status changes.
 * This is intentionally minimal -- Claude Code primarily reports status via MCP
 * (the omniscribe_status tool). Terminal output parsing serves as a supplementary
 * signal for detecting the REPL idle state, session exit, and error conditions.
 *
 * New service created for the plugin architecture (not extracted from core).
 */

import type { ProviderSessionStatus } from '@omniscribe/plugin-api';
import { stripAnsiCodes } from '@omniscribe/shared';

/**
 * Pattern for detecting the Claude Code REPL prompt.
 *
 * Claude Code shows a '>' prompt when idle and waiting for user input.
 * We look for a '>' character at the start of a line after stripping ANSI codes.
 */
const REPL_PROMPT_REGEX = /(?:^|\n)\s*>\s*$/;

/**
 * Pattern for detecting session exit/goodbye messages.
 */
const EXIT_PATTERNS = [
  /\bgoodbye\b/i,
  /\bsession\s+ended\b/i,
  /\bexiting\b/i,
  /\bthanks?\s+for\s+using\b/i,
];

/**
 * Pattern for detecting error conditions in terminal output.
 */
const ERROR_PATTERNS = [
  /\berror:\s+not\s+authenticated\b/i,
  /\berror:\s+invalid\s+api\s+key\b/i,
  /\bfatal\s+error\b/i,
  /\brate\s+limit\s+exceeded\b/i,
  /\bapi\s+error\b/i,
];

/**
 * Claude Status Parser Service.
 *
 * Provides terminal-output-based status detection as a supplementary signal
 * alongside Claude's primary MCP-based status reporting.
 */
export class ClaudeStatusParserService {
  /**
   * Parse terminal output to determine session status.
   *
   * Returns a ProviderSessionStatus if the output indicates a clear state
   * change, or null if the output is not a recognizable status indicator.
   *
   * Corresponds to AiProviderPlugin.parseTerminalStatus().
   *
   * @param output - Raw terminal output chunk
   * @returns Detected session status or null
   */
  parse(output: string): ProviderSessionStatus | null {
    // Strip ANSI escape codes for clean pattern matching
    const cleaned = stripAnsiCodes(output);

    // Check for error conditions first (highest priority)
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'error';
      }
    }

    // Check for exit/goodbye patterns
    for (const pattern of EXIT_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'finished';
      }
    }

    // Check for REPL prompt (idle state)
    if (REPL_PROMPT_REGEX.test(cleaned)) {
      return 'idle';
    }

    // No recognizable status indicator -- return null
    // MCP is the primary status channel for Claude Code
    return null;
  }
}
