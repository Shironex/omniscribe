import { Injectable } from '@nestjs/common';
import * as pty from 'node-pty';
import * as os from 'os';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { ClaudeUsage, UsageError, ClaudeCliStatus } from '@omniscribe/shared';
import { getClaudeCliStatus } from '../../main/utils/claude-detection';
import { buildSafeEnv } from '../shared/env-utils';
import { UsageOutputParser, stripAnsiCodes } from './usage-output-parser';

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
  private readonly logger = createLogger('UsageService');
  private readonly timeout = 45000; // 45 second timeout
  private readonly isWindows = os.platform() === 'win32';
  private readonly parser = new UsageOutputParser();

  /** Cached CLI status */
  private cachedStatus: ClaudeCliStatus | null = null;
  private statusCacheTimestamp = 0;

  /**
   * Get Claude CLI status (with caching)
   *
   * Delegates to getClaudeCliStatus() which detects the CLI installation
   * and checks authentication by reading ~/.claude/.credentials.json
   * for OAuth tokens, rather than spawning a process.
   */
  async getStatus(forceRefresh = false): Promise<ClaudeCliStatus> {
    const now = Date.now();

    // Return cached status if still valid
    if (
      !forceRefresh &&
      this.cachedStatus &&
      now - this.statusCacheTimestamp < STATUS_CACHE_TTL_MS
    ) {
      return this.cachedStatus;
    }

    this.cachedStatus = await getClaudeCliStatus();
    this.statusCacheTimestamp = now;

    return this.cachedStatus;
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
      const usage = this.parser.parseUsageOutput(output);
      return { usage };
    } catch (error) {
      const message = extractErrorMessage(error);
      this.logger.error('Failed to fetch usage', error);

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
          ...buildSafeEnv(),
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
        const errorMessage = extractErrorMessage(spawnError);
        this.logger.error('Failed to spawn PTY', spawnError);
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
        const cleanOutput = stripAnsiCodes(output);

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
        if (output.includes('token_expired') || output.includes('"type":"authentication_error"')) {
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
   * Kill a PTY process with platform-specific handling
   */
  private killPtyProcess(ptyProcess: pty.IPty, signal = 'SIGTERM'): void {
    if (this.isWindows) {
      ptyProcess.kill();
    } else {
      ptyProcess.kill(signal);
    }
  }
}
