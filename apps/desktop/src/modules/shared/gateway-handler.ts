import type { Logger } from '@omniscribe/shared';
import { extractErrorMessage } from '@omniscribe/shared';
import { validatePath } from './validation';

/**
 * Shared utility for gateway request handlers that follow the common pattern:
 *   1. Log the action
 *   2. Validate projectPath
 *   3. Execute the handler logic
 *   4. Return a default result with error on failure
 *
 * Eliminates ~30 lines of boilerplate per handler across git, github, and mcp gateways.
 *
 * The handler returns the success result. On path-validation failure or
 * caught exceptions, defaultResult is returned with the error message merged in.
 *
 * Type parameter TResponse should be explicitly provided at the call site
 * (matching the gateway method's return type) to ensure type safety.
 */
export async function handleGatewayRequest<
  TPayload extends { projectPath: string },
  TResponse,
>(options: {
  logger: Logger;
  action: string;
  payload: TPayload;
  /** Default result merged with error on path-validation failure or caught exception */
  defaultResult: NoInfer<Partial<TResponse>>;
  handler: (projectPath: string) => Promise<NoInfer<TResponse>>;
}): Promise<TResponse> {
  const { logger, action, payload, defaultResult, handler } = options;
  logger.debug(action, payload.projectPath);
  try {
    const pathError = validatePath(payload.projectPath);
    if (pathError) {
      return { ...defaultResult, error: pathError } as TResponse;
    }
    return await handler(payload.projectPath);
  } catch (error) {
    const message = extractErrorMessage(error, 'Unknown error');
    logger.error(`Error ${action}:`, error);
    return { ...defaultResult, error: message } as TResponse;
  }
}
