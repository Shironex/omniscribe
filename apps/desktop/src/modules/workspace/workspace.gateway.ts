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
import { OnEvent } from '@nestjs/event-emitter';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import {
  QuickAction,
  ProjectTabDTO,
  UserPreferences,
  AddTabPayload,
  UpdateTabThemePayload,
  RemoveTabPayload,
  SelectTabPayload,
  SaveStatePayload,
  UpdatePreferencePayload,
  ExecuteQuickActionPayload,
  GetQuickActionsPayload,
  UpdateQuickActionsPayload,
  SuccessResponse,
  TabsResponse,
  TabsOnlyResponse,
  PreferencesResponse,
  QuickActionsResponse,
  WorkspaceEvents,
  QuickActionEvents,
  createLogger,
} from '@omniscribe/shared';
import { InternalQuickActionEvents } from '../shared/events';
import { QuickActionService, QuickActionResult } from './quick-action.service';
import { WorkspaceService, WorkspaceState } from './workspace.service';
import { CORS_CONFIG } from '../shared/cors.config';

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

@UseGuards(WsThrottlerGuard)
@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class WorkspaceGateway implements OnGatewayInit {
  private readonly logger = createLogger('WorkspaceGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly quickActionService: QuickActionService,
    private readonly workspaceService: WorkspaceService
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Handle quick action execution request
   */
  @SubscribeMessage(QuickActionEvents.EXECUTE)
  async handleExecuteQuickAction(
    @MessageBody() payload: ExecuteQuickActionPayload,
    @ConnectedSocket() client: Socket
  ): Promise<QuickActionResult> {
    this.logger.log(`Executing quick action: ${payload.action.handler}`);

    const result = await this.quickActionService.executeAction(
      payload.sessionId,
      payload.action,
      payload.context
    );

    // Emit result to the client
    client.emit(QuickActionEvents.RESULT, {
      actionId: payload.action.id,
      handler: payload.action.handler,
      ...result,
    });

    return result;
  }

  /**
   * Handle get quick actions request
   */
  @SkipThrottle()
  @SubscribeMessage(QuickActionEvents.LIST)
  handleGetQuickActions(
    @MessageBody() payload: GetQuickActionsPayload,
    @ConnectedSocket() _client: Socket
  ): QuickAction[] {
    this.logger.debug(`[quick-action:list] category=${payload.category ?? 'all'}`);
    let actions = this.workspaceService.getQuickActions();

    // Filter by category if specified
    if (payload.category) {
      actions = actions.filter(action => action.category === payload.category);
    }

    // Filter by enabled status if specified
    if (payload.enabledOnly) {
      actions = actions.filter(action => action.enabled !== false);
    }

    return actions;
  }

  /**
   * Handle update quick actions request
   */
  @SubscribeMessage(QuickActionEvents.UPDATE)
  handleUpdateQuickActions(
    @MessageBody() payload: UpdateQuickActionsPayload,
    @ConnectedSocket() _client: Socket
  ): SuccessResponse {
    this.logger.debug(`[quick-action:update] count=${payload.actions.length}`);
    this.workspaceService.setQuickActions(payload.actions);

    // Broadcast update to all clients
    this.server.emit(QuickActionEvents.UPDATED, {
      actions: payload.actions,
    });

    return { success: true };
  }

  /**
   * Handle reset quick actions to defaults request
   */
  @SubscribeMessage(QuickActionEvents.RESET)
  handleResetQuickActions(@ConnectedSocket() _client: Socket): QuickActionsResponse {
    this.logger.debug('[quick-action:reset] resetting to defaults');
    this.workspaceService.resetQuickActionsToDefaults();

    const actions = this.workspaceService.getQuickActions();

    // Broadcast update to all clients
    this.server.emit(QuickActionEvents.UPDATED, {
      actions,
    });

    return { success: true, actions };
  }

  /**
   * Broadcast quick action executed event
   */
  @OnEvent(InternalQuickActionEvents.EXECUTED)
  onQuickActionExecuted(event: QuickActionExecutedEvent): void {
    this.server.emit(QuickActionEvents.EXECUTED, event);
  }

  /**
   * Broadcast AI prompt event from quick action
   */
  @OnEvent(InternalQuickActionEvents.AI_PROMPT)
  onAiPrompt(event: AiPromptEvent): void {
    this.server.emit(QuickActionEvents.AI_PROMPT, event);
  }

  // ============================================
  // Workspace State Handlers
  // ============================================

  /**
   * Handle get workspace state request - returns saved state on app start
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.GET_STATE)
  handleGetWorkspaceState(@ConnectedSocket() _client: Socket): WorkspaceState {
    this.logger.debug('Getting workspace state');
    return this.workspaceService.getWorkspaceState();
  }

  /**
   * Handle save workspace state request
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.SAVE_STATE)
  handleSaveWorkspaceState(
    @MessageBody() payload: SaveStatePayload,
    @ConnectedSocket() _client: Socket
  ): SuccessResponse {
    this.logger.debug('Saving workspace state');
    this.workspaceService.saveWorkspaceState(payload);
    return { success: true };
  }

  /**
   * Handle add tab request
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.ADD_TAB)
  handleAddTab(
    @MessageBody() payload: AddTabPayload,
    @ConnectedSocket() client: Socket
  ): TabsResponse {
    this.logger.log(`Adding tab for project: ${payload.projectPath}`);

    const tab: ProjectTabDTO = {
      id: payload.id,
      projectPath: payload.projectPath,
      name: payload.name,
      sessionIds: [],
      isActive: true,
      lastAccessedAt: new Date().toISOString(),
      theme: payload.theme,
    };

    const tabs = this.workspaceService.addTab(tab);
    const activeTabId = this.workspaceService.getActiveTabId() || payload.id;

    // Broadcast tab update to all other clients
    client.broadcast.emit(WorkspaceEvents.TABS_UPDATED, {
      tabs,
      activeTabId,
    });

    return { success: true, tabs, activeTabId };
  }

  /**
   * Handle update tab theme request
   */
  @SubscribeMessage(WorkspaceEvents.UPDATE_TAB_THEME)
  handleUpdateTabTheme(
    @MessageBody() payload: UpdateTabThemePayload,
    @ConnectedSocket() client: Socket
  ): TabsOnlyResponse {
    this.logger.log(`Updating tab theme: ${payload.tabId} -> ${payload.theme}`);

    const tabs = this.workspaceService.updateTabTheme(payload.tabId, payload.theme);

    // Broadcast tab update to all other clients
    client.broadcast.emit(WorkspaceEvents.TABS_UPDATED, {
      tabs,
      activeTabId: this.workspaceService.getActiveTabId(),
    });

    return { success: true, tabs };
  }

  /**
   * Handle remove tab request
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.REMOVE_TAB)
  handleRemoveTab(
    @MessageBody() payload: RemoveTabPayload,
    @ConnectedSocket() client: Socket
  ): TabsResponse {
    this.logger.log(`Removing tab: ${payload.tabId}`);

    const result = this.workspaceService.removeTab(payload.tabId);

    // Broadcast tab update to all other clients
    client.broadcast.emit(WorkspaceEvents.TABS_UPDATED, {
      tabs: result.tabs,
      activeTabId: result.activeTabId,
    });

    return { success: true, ...result };
  }

  /**
   * Handle select tab request
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.SELECT_TAB)
  handleSelectTab(
    @MessageBody() payload: SelectTabPayload,
    @ConnectedSocket() client: Socket
  ): TabsResponse {
    this.logger.debug(`Selecting tab: ${payload.tabId}`);

    const tabs = this.workspaceService.selectTab(payload.tabId);

    // Broadcast tab update to all other clients
    client.broadcast.emit(WorkspaceEvents.TABS_UPDATED, {
      tabs,
      activeTabId: payload.tabId,
    });

    return { success: true, tabs, activeTabId: payload.tabId };
  }

  /**
   * Handle update preferences request
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.UPDATE_PREFERENCE)
  handleUpdatePreference(
    @MessageBody() payload: UpdatePreferencePayload,
    @ConnectedSocket() client: Socket
  ): PreferencesResponse {
    this.logger.debug(`Updating preference: ${payload.key}`);

    const preferences = this.workspaceService.setPreference(payload.key, payload.value);

    // Broadcast preference update to all other clients
    client.broadcast.emit(WorkspaceEvents.PREFERENCES_UPDATED, {
      preferences,
    });

    return { success: true, preferences };
  }

  /**
   * Handle get preferences request
   */
  @SkipThrottle()
  @SubscribeMessage(WorkspaceEvents.GET_PREFERENCES)
  handleGetPreferences(@ConnectedSocket() _client: Socket): UserPreferences {
    this.logger.debug('[workspace:get-preferences] called');
    return this.workspaceService.getPreferences();
  }
}
