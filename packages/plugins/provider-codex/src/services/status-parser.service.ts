/**
 * Codex Status Parser Service
 *
 * Parses terminal output from OpenAI Codex CLI to detect session status changes.
 * The Codex CLI is a full-screen TUI (unlike Claude's simpler REPL), so status
 * parsing confidence is MEDIUM. Patterns err on the side of returning null
 * rather than an incorrect status.
 *
 * Priority order: error > finished > needs_input > working > idle
 *
 * New service created for the plugin architecture.
 */

import type { ProviderSessionStatus } from '@omniscribe/plugin-api';
import { stripAnsiCodes } from '@omniscribe/shared';

// ---------------------------------------------------------------------------
// Pattern definitions (ordered by detection priority)
// ---------------------------------------------------------------------------

/**
 * Error patterns (highest priority).
 * Authentication failures, rate limits, and fatal errors.
 */
const ERROR_PATTERNS: RegExp[] = [
  /\berror:\s*not\s+authenticated\b/i,
  /\brate\s+limit/i,
  /\bapi\s+error/i,
  /\bfatal\s+error/i,
  /\berror:\s*invalid.*key/i,
  /\binsufficient_quota/i,
];

/**
 * Exit/session-ended patterns.
 * Detected when Codex CLI session terminates normally.
 */
const EXIT_PATTERNS: RegExp[] = [/\bsession\s+ended\b/i, /\bexiting\b/i, /\bgoodbye\b/i];

/**
 * Needs-input patterns.
 * Codex CLI approval prompts and permission requests.
 */
const NEEDS_INPUT_PATTERNS: RegExp[] = [
  /\[y\/n\]/i,
  /approve\?/i,
  /allow\s+this/i,
  /\bpermission\b.*\b(?:allow|deny|approve)\b/i,
];

/**
 * Working patterns.
 * Indicators that Codex is actively processing.
 */
const WORKING_PATTERNS: RegExp[] = [
  /\bthinking\b/i,
  /\breasoning\b/i,
  /\bexecuting\b/i,
  /\brunning\b/i,
];

/**
 * Idle patterns (lowest priority).
 * Prompt indicator suggesting Codex is waiting for user input.
 */
const IDLE_PATTERNS: RegExp[] = [/>\s*$/];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Codex Status Parser Service.
 *
 * Provides terminal-output-based status detection for Codex CLI sessions.
 * Since Codex uses a full-screen TUI, status parsing is conservative --
 * returning null for any output that does not clearly match a known pattern.
 */
export class CodexStatusParserService {
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

    // 1. Check for error conditions (highest priority)
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'error';
      }
    }

    // 2. Check for exit/session-ended patterns
    for (const pattern of EXIT_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'finished';
      }
    }

    // 3. Check for approval/permission prompts
    for (const pattern of NEEDS_INPUT_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'needs_input';
      }
    }

    // 4. Check for working/processing indicators
    for (const pattern of WORKING_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'working';
      }
    }

    // 5. Check for idle/prompt indicators (lowest priority)
    for (const pattern of IDLE_PATTERNS) {
      if (pattern.test(cleaned)) {
        return 'idle';
      }
    }

    // No recognizable status indicator -- return null
    return null;
  }
}
