import { Injectable, Logger } from '@nestjs/common';
import * as pty from 'node-pty';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import type { ClaudeUsage, UsageError, ClaudeCliStatus } from '@omniscribe/shared';

/** Cache TTL for status checks (5 minutes) */
const STATUS_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Usage Service
 *
 * Fetches usage data by executing the Claude CLI's /usage command.
 * This approach doesn't require any API keys - it relies on the user
 * having already authenticated via `claude login`.
 *
 * Platform-specific implementations:
 * - Windows: Uses node-pty with ConPTY disabled (winpty)
 * - macOS/Linux: Uses node-pty
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly claudeBinary = 'claude';
  private readonly timeout = 45000; // 45 second timeout
  private readonly isWindows = os.platform() === 'win32';

  /** Cached CLI status */
  private cachedStatus: ClaudeCliStatus | null = null;
  private statusCacheTimestamp = 0;

  /**
   * Check if Claude CLI is available on the system
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkCmd = this.isWindows ? 'where' : 'which';
      const proc = spawn(checkCmd, [this.claudeBinary]);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Get Claude CLI status (with caching)
   */
  async getStatus(forceRefresh = false): Promise<ClaudeCliStatus> {
    const now = Date.now();
    const platform = os.platform();
    const arch = os.arch();

    // Return cached status if still valid
    if (
      !forceRefresh &&
      this.cachedStatus &&
      now - this.statusCacheTimestamp < STATUS_CACHE_TTL_MS
    ) {
      return this.cachedStatus;
    }

    // Check if installed
    const installed = await this.isAvailable();
    if (!installed) {
      this.cachedStatus = {
        installed: false,
        platform,
        arch,
        auth: { authenticated: false },
      };
      this.statusCacheTimestamp = now;
      return this.cachedStatus;
    }

    // Get version and path
    let version: string | undefined;
    let cliPath: string | undefined;
    try {
      const versionOutput = execSync(`${this.claudeBinary} --version`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      // Parse version from output like "Claude Code v1.0.27"
      const versionMatch = versionOutput.match(/v?(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        version = versionMatch[1];
      }
    } catch {
      // Version check failed, continue without it
    }

    // Get CLI path
    try {
      const checkCmd = this.isWindows ? 'where' : 'which';
      cliPath = execSync(`${checkCmd} ${this.claudeBinary}`, {
        encoding: 'utf-8',
        timeout: 5000,
      }).trim().split('\n')[0];
    } catch {
      // Path check failed, continue without it
    }

    // Check authentication by running a quick command
    const authenticated = await this.checkAuth();

    this.cachedStatus = {
      installed: true,
      version,
      path: cliPath,
      method: 'path',
      platform,
      arch,
      auth: { authenticated },
    };
    this.statusCacheTimestamp = now;

    return this.cachedStatus;
  }

  /**
   * Check if Claude CLI is authenticated
   * This is a quick check that doesn't require PTY
   */
  private async checkAuth(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        // Run `claude --help` which should work if authenticated
        // If not authenticated, some commands may fail
        const proc = spawn(this.claudeBinary, ['--help'], {
          timeout: 10000,
        });

        proc.on('close', (code) => {
          // If help works, CLI is at least installed and runnable
          // A more thorough check would require PTY, which is expensive
          // For now, assume authenticated if CLI works
          resolve(code === 0);
        });

        proc.on('error', () => {
          resolve(false);
        });

        // Timeout fallback
        setTimeout(() => {
          proc.kill();
          resolve(false);
        }, 10000);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Fetch usage data by executing the Claude CLI
   * @param workingDir - Working directory to run claude from (should be trusted)
   */
  async fetchUsageData(
    workingDir: string
  ): Promise<{ usage?: ClaudeUsage; error?: UsageError; message?: string }> {
    try {
      const output = await this.executeClaudeUsageCommand(workingDir);
      const usage = this.parseUsageOutput(output);
      return { usage };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch usage: ${message}`);

      // Determine error type
      let errorType: UsageError = 'unknown';
      if (message.includes('authentication') || message.includes('login')) {
        errorType = 'auth_required';
      } else if (message.includes('TRUST_PROMPT')) {
        errorType = 'trust_prompt';
      } else if (message.includes('timed out') || message.includes('too long')) {
        errorType = 'timeout';
      } else if (message.includes('not found') || message.includes('not available')) {
        errorType = 'cli_not_found';
      }

      return { error: errorType, message };
    }
  }

  /**
   * Execute the claude /usage command and return the output
   * Uses node-pty for PTY emulation
   */
  private executeClaudeUsageCommand(workingDir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let output = '';
      let settled = false;
      let hasSeenUsageData = false;
      let hasSeenTrustPrompt = false;

      // Use platform-appropriate shell and command
      const shell = this.isWindows ? 'cmd.exe' : '/bin/sh';
      // Use --add-dir to whitelist the current directory and bypass the trust prompt
      const args = this.isWindows
        ? ['/c', 'claude', '--add-dir', workingDir]
        : ['-c', `claude --add-dir "${workingDir}"`];

      // Build PTY spawn options
      const ptyOptions: pty.IPtyForkOptions = {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: workingDir,
        env: {
          ...this.getCleanEnv(),
          TERM: 'xterm-256color',
        },
      };

      // On Windows, always use winpty instead of ConPTY
      // ConPTY requires AttachConsole which fails in Electron
      if (this.isWindows) {
        (ptyOptions as pty.IWindowsPtyForkOptions).useConpty = false;
        this.logger.debug('Using winpty on Windows (ConPTY disabled for compatibility)');
      }

      let ptyProcess: pty.IPty;
      try {
        ptyProcess = pty.spawn(shell, args, ptyOptions);
      } catch (spawnError) {
        const errorMessage =
          spawnError instanceof Error ? spawnError.message : String(spawnError);
        this.logger.error(`Failed to spawn PTY: ${errorMessage}`);
        reject(new Error(`Unable to access terminal: ${errorMessage}`));
        return;
      }

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.killPtyProcess(ptyProcess);

          // Don't fail if we have data
          if (output.includes('Current session')) {
            resolve(output);
          } else if (hasSeenTrustPrompt) {
            reject(
              new Error(
                'TRUST_PROMPT_PENDING: Claude CLI is waiting for folder permission. Please run "claude" in your terminal and approve access.'
              )
            );
          } else {
            reject(
              new Error(
                'The Claude CLI took too long to respond. This can happen if the CLI is waiting for a trust prompt.'
              )
            );
          }
        }
      }, this.timeout);

      let hasSentCommand = false;
      let hasApprovedTrust = false;

      ptyProcess.onData((data: string) => {
        output += data;

        // Strip ANSI codes for easier matching
        const cleanOutput = this.stripAnsiCodes(output);

        // Check for authentication errors
        const hasAuthError =
          cleanOutput.includes('OAuth token does not meet scope requirement') ||
          cleanOutput.includes('token_expired') ||
          cleanOutput.includes('"type":"authentication_error"') ||
          cleanOutput.includes('"type": "authentication_error"');

        if (hasAuthError) {
          if (!settled) {
            settled = true;
            this.killPtyProcess(ptyProcess);
            reject(
              new Error(
                "Claude CLI authentication issue. Please run 'claude logout' and then 'claude login' in your terminal."
              )
            );
          }
          return;
        }

        // Check for usage data indicators
        const hasUsageIndicators =
          cleanOutput.includes('Current session') ||
          (cleanOutput.includes('Usage') && cleanOutput.includes('% left')) ||
          /\d+%\s*(left|used|remaining)/i.test(cleanOutput) ||
          cleanOutput.includes('Resets in') ||
          cleanOutput.includes('Current week');

        if (!hasSeenUsageData && hasUsageIndicators) {
          hasSeenUsageData = true;
          // Wait for full output, then send escape to exit
          setTimeout(() => {
            if (!settled && ptyProcess) {
              ptyProcess.write('\x1b'); // Send escape key

              // Fallback: force kill after 2s if ESC doesn't work
              setTimeout(() => {
                if (!settled && ptyProcess) {
                  this.killPtyProcess(ptyProcess);
                }
              }, 2000);
            }
          }, 3000);
        }

        // Handle Trust Dialog
        if (
          !hasApprovedTrust &&
          (cleanOutput.includes('Do you want to work in this folder?') ||
            cleanOutput.includes('Ready to code here') ||
            cleanOutput.includes('permission to work with your files'))
        ) {
          hasApprovedTrust = true;
          hasSeenTrustPrompt = true;
          // Wait then send Enter to approve
          setTimeout(() => {
            if (!settled && ptyProcess) {
              ptyProcess.write('\r');
            }
          }, 1000);
        }

        // Detect REPL prompt and send /usage command
        const isReplReady =
          cleanOutput.includes('❯') ||
          cleanOutput.includes('? for shortcuts') ||
          (cleanOutput.includes('Welcome back') && cleanOutput.includes('Claude')) ||
          (cleanOutput.includes('Tips for getting started') && cleanOutput.includes('Claude')) ||
          (cleanOutput.includes('Opus') && cleanOutput.includes('Claude API')) ||
          (cleanOutput.includes('Sonnet') && cleanOutput.includes('Claude API'));

        if (!hasSentCommand && isReplReady) {
          hasSentCommand = true;
          // Wait for REPL to fully settle
          setTimeout(() => {
            if (!settled && ptyProcess) {
              ptyProcess.write('/usage\r');

              // Send another enter after delay to confirm autocomplete if shown
              setTimeout(() => {
                if (!settled && ptyProcess) {
                  ptyProcess.write('\r');
                }
              }, 1200);
            }
          }, 1500);
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        clearTimeout(timeoutId);
        if (settled) return;
        settled = true;

        // Check for auth errors
        if (
          output.includes('token_expired') ||
          output.includes('"type":"authentication_error"')
        ) {
          reject(new Error("Authentication required - please run 'claude login'"));
          return;
        }

        if (output.trim()) {
          resolve(output);
        } else if (exitCode !== 0) {
          reject(new Error(`Command exited with code ${exitCode}`));
        } else {
          reject(new Error('No output from claude command'));
        }
      });
    });
  }

  /**
   * Get clean environment variables
   */
  private getCleanEnv(): Record<string, string> {
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }
    return cleanEnv;
  }

  /**
   * Kill a PTY process with platform-specific handling
   */
  private killPtyProcess(ptyProcess: pty.IPty, signal = 'SIGTERM'): void {
    if (this.isWindows) {
      ptyProcess.kill();
    } else {
      ptyProcess.kill(signal);
    }
  }

  /**
   * Strip ANSI escape codes from text
   */
  private stripAnsiCodes(text: string): string {
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
   * Parse the Claude CLI output to extract usage information
   */
  private parseUsageOutput(rawOutput: string): ClaudeUsage {
    const output = this.stripAnsiCodes(rawOutput);
    const lines = output
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);

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
        const percentMatch = line.match(/(\d{1,3})\s*%\s*(left|used|remaining)/i);
        if (percentMatch) {
          const value = parseInt(percentMatch[1], 10);
          const isUsed = percentMatch[2].toLowerCase() === 'used';
          // Convert "left" to "used" percentage
          percentage = isUsed ? value : 100 - value;
        }
      }

      // Extract reset time
      if (!resetText && line.toLowerCase().includes('reset')) {
        const match = line.match(/(Resets?.*)$/i);
        if (match) {
          resetText = match[1];
        }
      }
    }

    // Parse the reset time if we found one
    if (resetText) {
      // Clean up resetText
      resetText = resetText.replace(/(\d{1,3})\s*%\s*(left|used|remaining)/i, '').trim();
      resetText = resetText.replace(/(resets?)(\d)/i, '$1 $2');

      resetTime = this.parseResetTime(resetText, type);
      // Strip timezone from display text
      resetText = resetText.replace(/\s*\([A-Za-z_/]+\)\s*$/, '').trim();
    }

    return { percentage: percentage ?? 0, resetTime, resetText };
  }

  /**
   * Parse reset time from text like "Resets in 2h 15m" or "Resets Dec 22 at 8pm"
   */
  private parseResetTime(text: string, type: string): string {
    const now = new Date();

    // Try duration format: "Resets in 2h 15m"
    const durationMatch = text.match(
      /(\d+)\s*h(?:ours?)?(?:\s+(\d+)\s*m(?:in)?)?|(\d+)\s*m(?:in)?/i
    );
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
    const simpleTimeMatch = text.match(/resets\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
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
    const dateMatch = text.match(
      /(?:resets\s*)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s+at\s+|\s*,?\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i
    );
    if (dateMatch) {
      const monthName = dateMatch[1];
      const day = parseInt(dateMatch[2], 10);
      let hours = parseInt(dateMatch[3], 10);
      const minutes = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0;
      const ampm = dateMatch[5].toLowerCase();

      if (ampm === 'pm' && hours !== 12) hours += 12;
      else if (ampm === 'am' && hours === 12) hours = 0;

      const months: Record<string, number> = {
        jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
        jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
      };
      const month = months[monthName.toLowerCase().substring(0, 3)];

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
