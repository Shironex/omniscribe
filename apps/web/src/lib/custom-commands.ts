import {
  CustomCommandEvents,
  type CustomCommandListPayload,
  type CustomCommandListResponse,
  type CustomCommandCreatePayload,
  type CustomCommandCreateResponse,
  type CustomCommandUpdatePayload,
  type CustomCommandUpdateResponse,
  type CustomCommandDeletePayload,
  type CustomCommandDeleteResponse,
  type CustomCommandExecutePayload,
  type CustomCommandExecuteResponse,
} from '@omniscribe/shared';
import { emitAsync } from './socketHelpers';

/**
 * Socket emit helpers for the per-project custom command CRUD + execute API.
 * Mirrors the style of `lib/terminal.ts` — thin wrappers over `emitAsync` so
 * stores and components can stay free of socket boilerplate.
 */

export function listCustomCommands(projectPath: string): Promise<CustomCommandListResponse> {
  return emitAsync<CustomCommandListPayload, CustomCommandListResponse>(CustomCommandEvents.LIST, {
    projectPath,
  });
}

export function createCustomCommand(
  payload: CustomCommandCreatePayload
): Promise<CustomCommandCreateResponse> {
  return emitAsync<CustomCommandCreatePayload, CustomCommandCreateResponse>(
    CustomCommandEvents.CREATE,
    payload
  );
}

export function updateCustomCommand(
  payload: CustomCommandUpdatePayload
): Promise<CustomCommandUpdateResponse> {
  return emitAsync<CustomCommandUpdatePayload, CustomCommandUpdateResponse>(
    CustomCommandEvents.UPDATE,
    payload
  );
}

export function deleteCustomCommand(
  payload: CustomCommandDeletePayload
): Promise<CustomCommandDeleteResponse> {
  return emitAsync<CustomCommandDeletePayload, CustomCommandDeleteResponse>(
    CustomCommandEvents.DELETE,
    payload
  );
}

export function executeCustomCommand(
  payload: CustomCommandExecutePayload
): Promise<CustomCommandExecuteResponse> {
  return emitAsync<CustomCommandExecutePayload, CustomCommandExecuteResponse>(
    CustomCommandEvents.EXECUTE,
    payload
  );
}
