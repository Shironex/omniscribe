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
import { WorkspaceService, WorkspaceState } from './workspace.service';

/**
 * Project tab interface matching frontend
 */
interface ProjectTab {
  id: string;
  projectPath: string;
  name: string;
  sessionIds: string[];
  isActive: boolean;
  lastAccessedAt: string;
}

/**
 * User preferences interface
 */
interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarWidth: number;
  sidebarOpen: boolean;
  [key: string]: unknown;
}

/**
 * Payload for adding a tab
 */
interface AddTabPayload {
  id: string;
  projectPath: string;
  name: string;
}

/**
 * Payload for removing a tab
 */
interface RemoveTabPayload {
  tabId: string;
}

/**
 * Payload for selecting a tab
 */
interface SelectTabPayload {
  tabId: string;
}

/**
 * Payload for saving workspace state
 */
interface SaveStatePayload {
  tabs?: ProjectTab[];
  activeTabId?: string | null;
  preferences?: UserPreferences;
}

/**
 * Payload for updating preferences
 */
interface UpdatePreferencesPayload {
  key: string;
  value: unknown;
}

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
    console.log('[WorkspaceGateway] Getting workspace state');
    return this.workspaceService.getWorkspaceState();
  }

  /**
   * Handle save workspace state request
   */
  @SubscribeMessage('workspace:save-state')
  handleSaveWorkspaceState(
    @MessageBody() payload: SaveStatePayload,
    @ConnectedSocket() _client: Socket,
  ): { success: boolean } {
    console.log('[WorkspaceGateway] Saving workspace state');
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
  ): { success: boolean; tabs: ProjectTab[]; activeTabId: string } {
    console.log(`[WorkspaceGateway] Adding tab for project: ${payload.projectPath}`);

    const tab: ProjectTab = {
      id: payload.id,
      projectPath: payload.projectPath,
      name: payload.name,
      sessionIds: [],
      isActive: true,
      lastAccessedAt: new Date().toISOString(),
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
   * Handle remove tab request
   */
  @SubscribeMessage('workspace:remove-tab')
  handleRemoveTab(
    @MessageBody() payload: RemoveTabPayload,
    @ConnectedSocket() client: Socket,
  ): { success: boolean; tabs: ProjectTab[]; activeTabId: string | null } {
    console.log(`[WorkspaceGateway] Removing tab: ${payload.tabId}`);

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
  ): { success: boolean; tabs: ProjectTab[]; activeTabId: string } {
    console.log(`[WorkspaceGateway] Selecting tab: ${payload.tabId}`);

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
    @MessageBody() payload: UpdatePreferencesPayload,
    @ConnectedSocket() client: Socket,
  ): { success: boolean; preferences: UserPreferences } {
    console.log(`[WorkspaceGateway] Updating preference: ${payload.key}`);

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
