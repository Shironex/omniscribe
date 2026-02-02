import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { QuickAction } from '@omniscribe/shared';
import { QuickActionService, QuickActionResult } from './quick-action.service';
import { WorkspaceService } from './workspace.service';

/**
 * Payload for executing a quick action
 */
interface ExecuteQuickActionPayload {
  /** The session ID context (AI session or identifier) */
  sessionId: string;
  /** The quick action to execute */
  action: QuickAction;
  /** Additional context */
  context?: {
    projectPath?: string;
    terminalSessionId?: number;
  };
}

/**
 * Payload for getting quick actions
 */
interface GetQuickActionsPayload {
  /** Optional filter by category */
  category?: string;
  /** Only return enabled actions */
  enabledOnly?: boolean;
}

/**
 * Payload for updating quick actions
 */
interface UpdateQuickActionsPayload {
  actions: QuickAction[];
}

/**
 * Quick action executed event
 */
interface QuickActionExecutedEvent {
  handler: string;
  terminalId?: number;
  command?: string;
  repoPath?: string;
  commitMessage?: string;
  [key: string]: unknown;
}

/**
 * AI prompt event from quick action
 */
interface AiPromptEvent {
  sessionId: string;
  prompt: string;
  action: string;
  projectPath?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WorkspaceGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly quickActionService: QuickActionService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  afterInit(): void {
    console.log('[WorkspaceGateway] Initialized');
  }

  /**
   * Handle quick action execution request
   */
  @SubscribeMessage('quickaction:execute')
  async handleExecuteQuickAction(
    @MessageBody() payload: ExecuteQuickActionPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<QuickActionResult> {
    console.log(
      `[WorkspaceGateway] Executing quick action: ${payload.action.handler}`,
    );

    const result = await this.quickActionService.executeAction(
      payload.sessionId,
      payload.action,
      payload.context,
    );

    // Emit result to the client
    client.emit('quickaction:result', {
      actionId: payload.action.id,
      handler: payload.action.handler,
      ...result,
    });

    return result;
  }

  /**
   * Handle get quick actions request
   */
  @SubscribeMessage('quickaction:list')
  handleGetQuickActions(
    @MessageBody() payload: GetQuickActionsPayload,
    @ConnectedSocket() _client: Socket,
  ): QuickAction[] {
    let actions = this.workspaceService.getQuickActions();

    // Filter by category if specified
    if (payload.category) {
      actions = actions.filter((action) => action.category === payload.category);
    }

    // Filter by enabled status if specified
    if (payload.enabledOnly) {
      actions = actions.filter((action) => action.enabled !== false);
    }

    return actions;
  }

  /**
   * Handle update quick actions request
   */
  @SubscribeMessage('quickaction:update')
  handleUpdateQuickActions(
    @MessageBody() payload: UpdateQuickActionsPayload,
    @ConnectedSocket() _client: Socket,
  ): { success: boolean } {
    this.workspaceService.setQuickActions(payload.actions);

    // Broadcast update to all clients
    this.server.emit('quickaction:updated', {
      actions: payload.actions,
    });

    return { success: true };
  }

  /**
   * Handle reset quick actions to defaults request
   */
  @SubscribeMessage('quickaction:reset')
  handleResetQuickActions(
    @ConnectedSocket() _client: Socket,
  ): { success: boolean; actions: QuickAction[] } {
    this.workspaceService.resetQuickActionsToDefaults();

    const actions = this.workspaceService.getQuickActions();

    // Broadcast update to all clients
    this.server.emit('quickaction:updated', {
      actions,
    });

    return { success: true, actions };
  }

  /**
   * Broadcast quick action executed event
   */
  @OnEvent('quickaction.executed')
  onQuickActionExecuted(event: QuickActionExecutedEvent): void {
    this.server.emit('quickaction:executed', event);
  }

  /**
   * Broadcast AI prompt event from quick action
   */
  @OnEvent('quickaction.ai.prompt')
  onAiPrompt(event: AiPromptEvent): void {
    this.server.emit('quickaction:ai:prompt', event);
  }
}
