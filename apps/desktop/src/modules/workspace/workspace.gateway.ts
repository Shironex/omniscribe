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
  createLogger,
} from '@omniscribe/shared';
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

@WebSocketGateway({
  cors: CORS_CONFIG,
})
export class WorkspaceGateway implements OnGatewayInit {
  private readonly logger = createLogger('WorkspaceGateway');

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly quickActionService: QuickActionService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  afterInit(): void {
    this.logger.log('Initialized');
  }

  /**
   * Handle quick action execution request
   */
  @SubscribeMessage('quickaction:execute')
  async handleExecuteQuickAction(
    @MessageBody() payload: ExecuteQuickActionPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<QuickActionResult> {
    this.logger.log(`Executing quick action: ${payload.action.handler}`);

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
  ): SuccessResponse {
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
  ): QuickActionsResponse {
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

  // ============================================
  // Workspace State Handlers
  // ============================================

  /**
   * Handle get workspace state request - returns saved state on app start
   */
  @SubscribeMessage('workspace:get-state')
  handleGetWorkspaceState(
    @ConnectedSocket() _client: Socket,
  ): WorkspaceState {
    this.logger.log('Getting workspace state');
    return this.workspaceService.getWorkspaceState();
  }

  /**
   * Handle save workspace state request
   */
  @SubscribeMessage('workspace:save-state')
  handleSaveWorkspaceState(
    @MessageBody() payload: SaveStatePayload,
    @ConnectedSocket() _client: Socket,
  ): SuccessResponse {
    this.logger.log('Saving workspace state');
    this.workspaceService.saveWorkspaceState(payload);
    return { success: true };
  }

  /**
   * Handle add tab request
   */
  @SubscribeMessage('workspace:add-tab')
  handleAddTab(
    @MessageBody() payload: AddTabPayload,
    @ConnectedSocket() client: Socket,
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
    client.broadcast.emit('workspace:tabs-updated', {
      tabs,
      activeTabId,
    });

    return { success: true, tabs, activeTabId };
  }

  /**
   * Handle update tab theme request
   */
  @SubscribeMessage('workspace:update-tab-theme')
  handleUpdateTabTheme(
    @MessageBody() payload: UpdateTabThemePayload,
    @ConnectedSocket() client: Socket,
  ): TabsOnlyResponse {
    this.logger.log(`Updating tab theme: ${payload.tabId} -> ${payload.theme}`);

    const tabs = this.workspaceService.updateTabTheme(payload.tabId, payload.theme);

    // Broadcast tab update to all other clients
    client.broadcast.emit('workspace:tabs-updated', {
      tabs,
      activeTabId: this.workspaceService.getActiveTabId(),
    });

    return { success: true, tabs };
  }

  /**
   * Handle remove tab request
   */
  @SubscribeMessage('workspace:remove-tab')
  handleRemoveTab(
    @MessageBody() payload: RemoveTabPayload,
    @ConnectedSocket() client: Socket,
  ): TabsResponse {
    this.logger.log(`Removing tab: ${payload.tabId}`);

    const result = this.workspaceService.removeTab(payload.tabId);

    // Broadcast tab update to all other clients
    client.broadcast.emit('workspace:tabs-updated', {
      tabs: result.tabs,
      activeTabId: result.activeTabId,
    });

    return { success: true, ...result };
  }

  /**
   * Handle select tab request
   */
  @SubscribeMessage('workspace:select-tab')
  handleSelectTab(
    @MessageBody() payload: SelectTabPayload,
    @ConnectedSocket() client: Socket,
  ): TabsResponse {
    this.logger.log(`Selecting tab: ${payload.tabId}`);

    const tabs = this.workspaceService.selectTab(payload.tabId);

    // Broadcast tab update to all other clients
    client.broadcast.emit('workspace:tabs-updated', {
      tabs,
      activeTabId: payload.tabId,
    });

    return { success: true, tabs, activeTabId: payload.tabId };
  }

  /**
   * Handle update preferences request
   */
  @SubscribeMessage('workspace:update-preference')
  handleUpdatePreference(
    @MessageBody() payload: UpdatePreferencePayload,
    @ConnectedSocket() client: Socket,
  ): PreferencesResponse {
    this.logger.log(`Updating preference: ${payload.key}`);

    const preferences = this.workspaceService.setPreference(payload.key, payload.value);

    // Broadcast preference update to all other clients
    client.broadcast.emit('workspace:preferences-updated', {
      preferences,
    });

    return { success: true, preferences };
  }

  /**
   * Handle get preferences request
   */
  @SubscribeMessage('workspace:get-preferences')
  handleGetPreferences(
    @ConnectedSocket() _client: Socket,
  ): UserPreferences {
    return this.workspaceService.getPreferences();
  }
}
