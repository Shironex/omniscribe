import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { validatePath } from '../shared/validation';
import {
  CustomCommandListPayload,
  CustomCommandListResponse,
  CustomCommandCreatePayload,
  CustomCommandCreateResponse,
  CustomCommandUpdatePayload,
  CustomCommandUpdateResponse,
  CustomCommandDeletePayload,
  CustomCommandDeleteResponse,
  CustomCommandExecutePayload,
  CustomCommandExecuteResponse,
  CustomCommandsChangedEvent,
  CustomCommandEvents,
  createLogger,
  extractErrorMessage,
} from '@omniscribe/shared';
import { CustomCommandService } from './custom-command.service';
import { CORS_CONFIG } from '../shared/cors.config';
import { TerminalGateway } from '../terminal';

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class CustomCommandGateway implements OnGatewayInit {
  private readonly logger = createLogger('CustomCommandGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly customCommandService: CustomCommandService,
    private readonly terminalGateway: TerminalGateway
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  @SkipThrottle()
  @SubscribeMessage(CustomCommandEvents.LIST)
  handleList(
    @MessageBody() payload: CustomCommandListPayload,
    @ConnectedSocket() _client: Socket
  ): CustomCommandListResponse {
    this.logger.debug(`[customcommand:list] projectPath=${payload?.projectPath}`);
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { commands: [], error: pathError };
    }
    try {
      return { commands: this.customCommandService.list(payload.projectPath) };
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to list custom commands');
      this.logger.error('Error listing custom commands:', error);
      return { commands: [], error: message };
    }
  }

  @SubscribeMessage(CustomCommandEvents.CREATE)
  handleCreate(
    @MessageBody() payload: CustomCommandCreatePayload,
    @ConnectedSocket() _client: Socket
  ): CustomCommandCreateResponse {
    this.logger.debug(`[customcommand:create] projectPath=${payload?.projectPath}`);
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { success: false, error: pathError };
    }
    try {
      const command = this.customCommandService.create(payload.projectPath, payload.command);
      const commands = this.customCommandService.list(payload.projectPath);
      this.broadcastChanged(payload.projectPath, commands);
      return { success: true, command, commands };
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to create custom command');
      this.logger.error('Error creating custom command:', error);
      return { success: false, error: message };
    }
  }

  @SubscribeMessage(CustomCommandEvents.UPDATE)
  handleUpdate(
    @MessageBody() payload: CustomCommandUpdatePayload,
    @ConnectedSocket() _client: Socket
  ): CustomCommandUpdateResponse {
    this.logger.debug(
      `[customcommand:update] projectPath=${payload?.projectPath} id=${payload?.id}`
    );
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { success: false, error: pathError };
    }
    if (!payload.id || typeof payload.id !== 'string') {
      return { success: false, error: 'Invalid id: must be a non-empty string' };
    }
    try {
      const command = this.customCommandService.update(
        payload.projectPath,
        payload.id,
        payload.updates ?? {}
      );
      if (!command) {
        return { success: false, error: `Custom command not found: ${payload.id}` };
      }
      const commands = this.customCommandService.list(payload.projectPath);
      this.broadcastChanged(payload.projectPath, commands);
      return { success: true, command, commands };
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to update custom command');
      this.logger.error('Error updating custom command:', error);
      return { success: false, error: message };
    }
  }

  @SubscribeMessage(CustomCommandEvents.DELETE)
  handleDelete(
    @MessageBody() payload: CustomCommandDeletePayload,
    @ConnectedSocket() _client: Socket
  ): CustomCommandDeleteResponse {
    this.logger.debug(
      `[customcommand:delete] projectPath=${payload?.projectPath} id=${payload?.id}`
    );
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { success: false, error: pathError };
    }
    if (!payload.id || typeof payload.id !== 'string') {
      return { success: false, error: 'Invalid id: must be a non-empty string' };
    }
    try {
      const removed = this.customCommandService.remove(payload.projectPath, payload.id);
      if (!removed) {
        return { success: false, error: `Custom command not found: ${payload.id}` };
      }
      const commands = this.customCommandService.list(payload.projectPath);
      this.broadcastChanged(payload.projectPath, commands);
      return { success: true, commands };
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to delete custom command');
      this.logger.error('Error deleting custom command:', error);
      return { success: false, error: message };
    }
  }

  @SubscribeMessage(CustomCommandEvents.EXECUTE)
  async handleExecute(
    @MessageBody() payload: CustomCommandExecutePayload,
    @ConnectedSocket() client: Socket
  ): Promise<CustomCommandExecuteResponse> {
    this.logger.debug(
      `[customcommand:execute] projectPath=${payload?.projectPath} id=${payload?.id}`
    );
    const pathError = validatePath(payload?.projectPath);
    if (pathError) {
      return { success: false, error: pathError };
    }
    if (!payload.id || typeof payload.id !== 'string') {
      return { success: false, error: 'Invalid id: must be a non-empty string' };
    }
    try {
      const result = await this.customCommandService.execute(payload.projectPath, payload.id);
      // Subscribe the calling client to the terminal room so it receives output.
      // Mirrors session.gateway.ts handleCreate — without this, the new tile
      // shows "Connecting to terminal..." forever because terminal:output is
      // emitted to `terminal:${id}` and the client never joined.
      const room = `terminal:${result.terminalSessionId}`;
      client.join(room);
      this.terminalGateway.registerClientSession(client.id, result.terminalSessionId);
      return {
        success: true,
        sessionId: result.sessionId,
        terminalSessionId: result.terminalSessionId,
      };
    } catch (error) {
      const message = extractErrorMessage(error, 'Failed to execute custom command');
      this.logger.error('Error executing custom command:', error);
      return { success: false, error: message };
    }
  }

  private broadcastChanged(
    projectPath: string,
    commands: CustomCommandsChangedEvent['commands']
  ): void {
    const event: CustomCommandsChangedEvent = { projectPath, commands };
    this.server.emit(CustomCommandEvents.CHANGED, event);
  }
}
