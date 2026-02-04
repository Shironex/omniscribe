/**
 * HTTP client for communicating with Omniscribe desktop app
 */

import type { StatusPayload, SessionStatusState } from '@omniscribe/shared';
import type { EnvironmentConfig } from '../config/index.js';
import type { Logger } from '../utils/index.js';

export interface OmniscribeHttpClient {
  /**
   * Report session status to Omniscribe
   */
  reportStatus(
    state: SessionStatusState,
    message?: string,
    needsInputPrompt?: string
  ): Promise<boolean>;
}

/**
 * Create an HTTP client for Omniscribe communication
 */
export function createHttpClient(
  config: EnvironmentConfig,
  logger: Logger
): OmniscribeHttpClient {
  const { sessionId, instanceId, statusUrl } = config;

  async function reportStatus(
    state: SessionStatusState,
    message?: string,
    needsInputPrompt?: string
  ): Promise<boolean> {
    if (!statusUrl || !sessionId || !instanceId) {
      logger.error('Status reporting not configured');
      return false;
    }

    const payload: StatusPayload = {
      sessionId,
      instanceId,
      state,
      message,
      needsInputPrompt,
      timestamp: new Date().toISOString(),
    };

    logger.info(`Sending status to ${statusUrl}: state=${state}${message ? `, message=${message}` : ''}`);

    try {
      const response = await fetch(statusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      logger.info(`Status response: ${response.status}`);
      return response.ok;
    } catch (error) {
      logger.error('Status report error:', error);
      return false;
    }
  }

  return {
    reportStatus,
  };
}
