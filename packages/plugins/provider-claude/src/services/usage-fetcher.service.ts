/**
 * Claude Usage Fetcher Service
 *
 * Fetches usage data by executing the Claude CLI's /usage command via PTY.
 * Handles trust dialog approval, REPL detection, authentication errors,
 * and timeout management.
 *
 * Extracted from apps/desktop/src/modules/usage/usage.service.ts (PTY logic).
 * Pure TypeScript class with no NestJS dependencies. Uses node-pty as a
 * peer dependency provided by the consumer (desktop app).
 */

import * as os from 'os';
import { createLogger, extractErrorMessage, stripAnsiCodes } from '@omniscribe/shared';
import { buildSafeEnv } from '@omniscribe/shared/node';
import type { ClaudeUsage } from '@omniscribe/shared';
import { ClaudeUsageParserService } from './usage-parser.service';

// ---- Minimal node-pty type definitions (peerDependency, not available at build time) ----

/** Minimal IPty interface matching node-pty's IPty */
interface IPty {
  onData: (callback: (data: string) => void) => void;
  onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => void;
  write: (data: string) => void;
  kill: (signal?: string) => void;
}

/** Minimal IPtyForkOptions interface matching node-pty's fork options */
interface IPtyForkOptions {
  name?: string;
  cols?: number;
  rows?: number;
  cwd?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

/** Windows-specific PTY fork options */
interface IWindowsPtyForkOptions extends IPtyForkOptions {
  useConpty?: boolean;
}

/** Minimal node-pty module interface for dynamic require */
interface NodePtyModule {
  spawn: (file: string, args: string[], options: IPtyForkOptions) => IPty;
}

// Timing for driving the Claude CLI PTY through trust/REPL prompts to the /usage output.
// These are deliberate human-paced delays to let the interactive CLI settle between writes.
const FETCH_TIMEOUT_MS = 45_000;
const USAGE_OUTPUT_SETTLE_MS = 3_000; // wait for full usage output before sending ESC
const FORCE_KILL_FALLBACK_MS = 2_000; // force-kill if ESC doesn't exit the REPL
const TRUST_DIALOG_ENTER_MS = 1_000; // pause before approving the trust dialog
const REPL_SETTLE_MS = 1_500; // let the REPL settle before sending /usage
const AUTOCOMPLETE_CONFIRM_MS = 1_200; // second Enter to confirm any autocomplete

/**
 * Claude Usage Fetcher Service.
 *
 * Fetches usage data by spawning a Claude CLI process via PTY, navigating
 * through trust dialogs and REPL prompts, and sending the /usage command.
 * Parses the output into structured ClaudeUsage data.
 */
export class ClaudeUsageFetcherService {
  private readonly logger = createLogger('ClaudeUsageFetcher');
  private readonly timeout = FETCH_TIMEOUT_MS;
  private readonly isWindows = os.platform() === 'win32';
  private readonly parser = new ClaudeUsageParserService();

  /**
   * The last successfully fetched usage data.
   * Retained for backward compat so the core adapter can access raw ClaudeUsage
   * without going through the ProviderUsageData conversion.
   * Reset to null before each fetch, set after successful parse.
   */
  public lastFetchedUsage: ClaudeUsage | null = null;

  /**
   * Fetch usage data by executing the Claude CLI's /usage command via PTY.
   *
   * @param workingDir - Working directory to run claude from (should be trusted)
   * @param env - Optional pre-filtered environment. If not provided, builds a safe env from process.env.
   * @returns Parsed ClaudeUsage data
   * @throws Error on timeout, auth errors, or CLI unavailability
   */
  async fetchUsage(workingDir: string, env?: Record<string, string>): Promise<ClaudeUsage> {
    // Reset last fetched usage before each attempt
    this.lastFetchedUsage = null;

    const output = await this.executeClaudeUsageCommand(workingDir, env);
    const usage = this.parser.parseUsageOutput(output);

    // Store for backward compat access
    this.lastFetchedUsage = usage;

    return usage;
  }

  /**
   * Execute the claude /usage command and return the raw output.
   * Uses node-pty for PTY emulation.
   */
  private executeClaudeUsageCommand(
    workingDir: string,
    env?: Record<string, string>
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Dynamically require node-pty (peerDependency)
      let pty: NodePtyModule;
      try {
        pty = require('node-pty') as NodePtyModule;
      } catch {
        reject(
          new Error(
            'node-pty is not available. Ensure node-pty is installed in the host application.'
          )
        );
        return;
      }

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
      const safeEnv = env ?? buildSafeEnv();
      const ptyOptions: IPtyForkOptions = {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd: workingDir,
        env: {
          ...safeEnv,
          TERM: 'xterm-256color',
        },
      };

      // On Windows, always use winpty instead of ConPTY
      // ConPTY requires AttachConsole which fails in Electron
      if (this.isWindows) {
        (ptyOptions as IWindowsPtyForkOptions).useConpty = false;
        this.logger.debug('Using winpty on Windows (ConPTY disabled for compatibility)');
      }

      let ptyProcess: IPty;
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
      let cleanOutput = '';

      ptyProcess.onData((data: string) => {
        output += data;

        // Strip ANSI codes from the new chunk and append to clean buffer
        cleanOutput += stripAnsiCodes(data);

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

              // Fallback: force kill if ESC doesn't work
              setTimeout(() => {
                if (!settled && ptyProcess) {
                  this.killPtyProcess(ptyProcess);
                }
              }, FORCE_KILL_FALLBACK_MS);
            }
          }, USAGE_OUTPUT_SETTLE_MS);
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
          }, TRUST_DIALOG_ENTER_MS);
        }

        // Detect REPL prompt and send /usage command
        const isReplReady =
          cleanOutput.includes('\u276F') ||
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
              }, AUTOCOMPLETE_CONFIRM_MS);
            }
          }, REPL_SETTLE_MS);
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
  private killPtyProcess(ptyProcess: IPty, signal = 'SIGTERM'): void {
    if (this.isWindows) {
      ptyProcess.kill();
    } else {
      ptyProcess.kill(signal);
    }
  }
}
