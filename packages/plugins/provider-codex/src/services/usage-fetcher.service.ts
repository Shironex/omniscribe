/**
 * Codex Usage Fetcher Service
 *
 * Fetches usage data from the Codex CLI using two strategies:
 * 1. Primary: Codex app-server JSON-RPC API (provides rate limits + plan type)
 * 2. Fallback: Auth file JWT parsing (provides plan type only)
 *
 * Uses child_process spawn (NOT node-pty) since the app-server communicates
 * via line-based JSON-RPC over stdin/stdout.
 *
 * Adapted from Automaker's CodexAppServerService and CodexUsageService.
 */

import { spawn, execFile, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger, extractErrorMessage } from '@omniscribe/shared';
import type { CodexUsageData, CodexRateLimitWindow, CodexPlanType } from '../types';

const logger = createLogger('CodexUsageFetcher');

/** Valid plan types for normalization */
const VALID_PLAN_TYPES: CodexPlanType[] = ['free', 'plus', 'pro', 'team', 'enterprise', 'edu'];

/** Timeout for individual JSON-RPC requests (ms) */
const REQUEST_TIMEOUT = 10_000;

// ---------------------------------------------------------------------------
// CLI path resolution helpers
// ---------------------------------------------------------------------------

/**
 * Known installation paths for the Codex CLI binary.
 */
function getCodexCliPaths(): string[] {
  const home = os.homedir();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return [
      path.join(home, '.local', 'bin', 'codex.exe'),
      path.join(appData, 'npm', 'codex.cmd'),
      path.join(appData, 'npm', 'codex'),
      path.join(home, '.volta', 'bin', 'codex.exe'),
      path.join(localAppData, 'pnpm', 'codex.cmd'),
    ];
  }

  return [
    path.join(home, '.local', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    '/usr/bin/codex',
    path.join(home, '.npm-global', 'bin', 'codex'),
    path.join(home, '.volta', 'bin', 'codex'),
  ];
}

/**
 * Find the Codex CLI path.
 * First tries `which`/`where` on PATH, then checks known installation paths.
 */
async function findCodexCli(): Promise<string | null> {
  // 1. Try PATH lookup
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile(whichCmd, ['codex'], { timeout: 5000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim().split('\n')[0]);
      });
    });
    if (result && fs.existsSync(result)) return result;
  } catch {
    // Not on PATH, try known locations
  }

  // 2. Check known installation paths
  for (const candidatePath of getCodexCliPaths()) {
    try {
      if (fs.existsSync(candidatePath)) return candidatePath;
    } catch {
      // Skip inaccessible paths
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Codex Usage Fetcher Service.
 *
 * Fetches rate limit and plan data from Codex CLI using the app-server
 * JSON-RPC API as the primary method, with auth file JWT parsing as fallback.
 */
export class CodexUsageFetcherService {
  /**
   * Fetch usage data from Codex CLI.
   *
   * Attempts app-server JSON-RPC first (most reliable, provides rate limits),
   * then falls back to auth file JWT parsing (plan type only).
   *
   * @param _workingDir - Working directory (reserved for future use)
   * @returns Codex usage data with rate limits and/or plan type
   */
  async fetchUsage(_workingDir: string): Promise<CodexUsageData> {
    // Try app-server first (most reliable)
    const appServerData = await this.fetchFromAppServer();
    if (appServerData) {
      logger.debug('Fetched usage from app-server');
      return appServerData;
    }

    logger.debug('App-server failed, trying auth file fallback');

    // Fallback: auth file JWT parsing
    const authData = await this.fetchFromAuthFile();
    if (authData) {
      logger.debug('Fetched usage from auth file');
      return authData;
    }

    logger.debug('All methods failed, returning unknown');

    // Last resort: return unknown plan
    return {
      rateLimits: { planType: 'unknown' },
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Fetch usage data via the Codex app-server JSON-RPC protocol.
   *
   * Protocol sequence:
   * 1. Send `initialize` request with client info
   * 2. Send `initialized` notification (no response expected)
   * 3. Send `account/read` request -> get planType
   * 4. Send `account/rateLimits/read` request -> get primary/secondary rate limits
   */
  private async fetchFromAppServer(): Promise<CodexUsageData | null> {
    let childProcess: ChildProcess | null = null;

    try {
      const cliPath = await findCodexCli();
      if (!cliPath) return null;

      // On Windows, .cmd files must be run through shell
      const needsShell = process.platform === 'win32' && cliPath.toLowerCase().endsWith('.cmd');

      childProcess = spawn(cliPath, ['app-server'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          TERM: 'dumb',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: needsShell,
      });

      if (!childProcess.stdin || !childProcess.stdout) {
        throw new Error('Failed to create stdio pipes');
      }

      // Setup readline for JSON-RPC line-based protocol
      const rl = readline.createInterface({
        input: childProcess.stdout,
        crlfDelay: Infinity,
      });

      // Message ID counter
      let messageId = 0;
      const pendingRequests = new Map<
        number,
        {
          resolve: (value: unknown) => void;
          reject: (error: Error) => void;
          timeout: NodeJS.Timeout;
        }
      >();

      // Process incoming JSON-RPC responses
      rl.on('line', line => {
        if (!line.trim()) return;

        try {
          const message = JSON.parse(line);

          // Handle response (has id field)
          if ('id' in message && message.id !== undefined) {
            const pending = pendingRequests.get(message.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingRequests.delete(message.id);
              if (message.error) {
                pending.reject(new Error(message.error.message || 'JSON-RPC error'));
              } else {
                pending.resolve(message.result);
              }
            }
          }
          // Ignore notifications (no id field)
        } catch {
          // Ignore non-JSON lines
        }
      });

      // Helper: send JSON-RPC request and wait for response
      const sendRequest = <R>(method: string, params?: unknown): Promise<R> => {
        return new Promise((resolve, reject) => {
          const id = ++messageId;
          const request = { method, id, params: params ?? {} };

          const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Request timeout: ${method}`));
          }, REQUEST_TIMEOUT);

          pendingRequests.set(id, {
            resolve: resolve as (value: unknown) => void,
            reject,
            timeout,
          });

          childProcess!.stdin!.write(JSON.stringify(request) + '\n');
        });
      };

      // Helper: send JSON-RPC notification (no response expected)
      const sendNotification = (method: string, params?: unknown): void => {
        const notification = params ? { method, params } : { method };
        childProcess!.stdin!.write(JSON.stringify(notification) + '\n');
      };

      // 1. Initialize
      await sendRequest('initialize', {
        clientInfo: {
          name: 'omniscribe',
          title: 'Omniscribe',
          version: '1.0.0',
        },
      });

      // 2. Send initialized notification
      sendNotification('initialized');

      // 3. Fetch account info for plan type
      let planType: CodexPlanType = 'unknown';

      try {
        const accountResult = await sendRequest<{
          account?: { planType?: string };
        }>('account/read', { refreshToken: false });

        if (accountResult?.account?.planType) {
          const normalized = accountResult.account.planType.toLowerCase() as CodexPlanType;
          if (VALID_PLAN_TYPES.includes(normalized)) {
            planType = normalized;
          }
        }
      } catch (err) {
        logger.debug('account/read failed:', extractErrorMessage(err));
      }

      // 4. Fetch rate limits
      let primary: CodexRateLimitWindow | undefined;
      let secondary: CodexRateLimitWindow | undefined;

      try {
        const rateLimitsResult = await sendRequest<{
          rateLimits?: {
            primary?: { usedPercent: number; windowDurationMins: number; resetsAt: number };
            secondary?: { usedPercent: number; windowDurationMins: number; resetsAt: number };
            planType?: string;
          };
        }>('account/rateLimits/read', {});

        // Prefer planType from rateLimits (more accurate)
        if (rateLimitsResult?.rateLimits?.planType) {
          const normalized = rateLimitsResult.rateLimits.planType.toLowerCase() as CodexPlanType;
          if (VALID_PLAN_TYPES.includes(normalized)) {
            planType = normalized;
          }
        }

        if (rateLimitsResult?.rateLimits?.primary) {
          const p = rateLimitsResult.rateLimits.primary;
          primary = {
            limit: -1,
            used: -1,
            remaining: -1,
            usedPercent: p.usedPercent,
            windowDurationMins: p.windowDurationMins,
            resetsAt: p.resetsAt,
          };
        }

        if (rateLimitsResult?.rateLimits?.secondary) {
          const s = rateLimitsResult.rateLimits.secondary;
          secondary = {
            limit: -1,
            used: -1,
            remaining: -1,
            usedPercent: s.usedPercent,
            windowDurationMins: s.windowDurationMins,
            resetsAt: s.resetsAt,
          };
        }
      } catch (err) {
        logger.debug('account/rateLimits/read failed:', extractErrorMessage(err));
      }

      // Clean up
      rl.close();
      childProcess.kill('SIGTERM');

      return {
        rateLimits: {
          primary,
          secondary,
          planType,
        },
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      logger.error('fetchFromAppServer failed:', extractErrorMessage(err));
      return null;
    } finally {
      if (childProcess && !childProcess.killed) {
        childProcess.kill('SIGTERM');
      }
    }
  }

  /**
   * Fallback: extract plan type from the Codex auth file JWT.
   *
   * Reads `~/.codex/auth.json`, parses the `tokens.id_token` JWT payload,
   * and extracts the plan type from the `https://api.openai.com/auth` claim.
   */
  private async fetchFromAuthFile(): Promise<CodexUsageData | null> {
    try {
      const authPath = path.join(os.homedir(), '.codex', 'auth.json');

      if (!fs.existsSync(authPath)) {
        return null;
      }

      const content = fs.readFileSync(authPath, 'utf-8');
      const authData = JSON.parse(content);

      if (!authData.tokens?.id_token) {
        return null;
      }

      const claims = this.parseJwt(authData.tokens.id_token);
      if (!claims) {
        return null;
      }

      let planType: CodexPlanType = 'unknown';

      // Extract plan type from nested OpenAI auth claim
      const openaiAuthClaim = claims['https://api.openai.com/auth'];
      if (
        openaiAuthClaim &&
        typeof openaiAuthClaim === 'object' &&
        !Array.isArray(openaiAuthClaim)
      ) {
        const openaiAuth = openaiAuthClaim as Record<string, unknown>;

        if (typeof openaiAuth.chatgpt_plan_type === 'string') {
          const normalized = openaiAuth.chatgpt_plan_type.toLowerCase() as CodexPlanType;
          if (VALID_PLAN_TYPES.includes(normalized)) {
            planType = normalized;
          }
        }

        // Check subscription expiry
        if (typeof openaiAuth.chatgpt_subscription_active_until === 'string') {
          const expiryDate = new Date(openaiAuth.chatgpt_subscription_active_until);
          if (!isNaN(expiryDate.getTime()) && expiryDate < new Date()) {
            planType = 'free'; // Expired subscription
          }
        }
      } else {
        // Fallback: try top-level claim names
        const possibleClaims = [
          'https://chatgpt.com/account_type',
          'account_type',
          'plan',
          'plan_type',
        ];

        for (const claimName of possibleClaims) {
          const claimValue = claims[claimName];
          if (claimValue && typeof claimValue === 'string') {
            const normalized = claimValue.toLowerCase() as CodexPlanType;
            if (VALID_PLAN_TYPES.includes(normalized)) {
              planType = normalized;
              break;
            }
          }
        }
      }

      if (planType === 'unknown') {
        return null;
      }

      return {
        rateLimits: { planType },
        lastUpdated: new Date().toISOString(),
      };
    } catch (err) {
      logger.debug('fetchFromAuthFile failed:', extractErrorMessage(err));
      return null;
    }
  }

  /**
   * Parse a JWT token and return the decoded payload claims.
   *
   * @param token - JWT string (header.payload.signature)
   * @returns Decoded claims object or null on failure
   */
  private parseJwt(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf-8');

      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }
}
