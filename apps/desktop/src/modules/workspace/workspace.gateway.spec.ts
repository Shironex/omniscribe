import { Test, TestingModule } from '@nestjs/testing';
import { Server, Socket } from 'socket.io';
import { WorkspaceGateway } from './workspace.gateway';
import { QuickActionService, QuickActionResult } from './quick-action.service';
import { WorkspaceService, WorkspaceState } from './workspace.service';
import type { QuickAction, ProjectTabDTO, UserPreferences } from '@omniscribe/shared';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

function createMockServer(): Server {
  return {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  } as unknown as Server;
}

// ---------------------------------------------------------------------------
// Shared test data helpers
// ---------------------------------------------------------------------------

function makeQuickAction(overrides: Partial<QuickAction> = {}): QuickAction {
  return {
    id: 'test-action',
    title: 'Test Action',
    category: 'terminal',
    icon: 'Play',
    enabled: true,
    handler: 'terminal:execute',
    params: { command: 'echo hi' },
    ...overrides,
  } as QuickAction;
}

function makeTab(overrides: Partial<ProjectTabDTO> = {}): ProjectTabDTO {
  return {
    id: 'tab-1',
    projectPath: '/projects/app',
    name: 'App',
    sessionIds: [],
    isActive: true,
    lastAccessedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('WorkspaceGateway', () => {
  let gateway: WorkspaceGateway;
  let quickActionService: jest.Mocked<QuickActionService>;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let mockServer: Server;

  beforeEach(async () => {
    quickActionService = {
      executeAction: jest.fn().mockResolvedValue({
        success: true,
        message: 'Done',
      } as QuickActionResult),
    } as unknown as jest.Mocked<QuickActionService>;

    workspaceService = {
      getQuickActions: jest.fn().mockReturnValue([]),
      setQuickActions: jest.fn(),
      resetQuickActionsToDefaults: jest.fn(),
      getWorkspaceState: jest.fn().mockReturnValue({
        tabs: [],
        activeTabId: null,
        preferences: { theme: 'dark' },
        quickActions: [],
      } as WorkspaceState),
      saveWorkspaceState: jest.fn(),
      addTab: jest.fn().mockReturnValue([]),
      getActiveTabId: jest.fn().mockReturnValue(null),
      updateTabTheme: jest.fn().mockReturnValue([]),
      removeTab: jest.fn().mockReturnValue({ tabs: [], activeTabId: null }),
      selectTab: jest.fn().mockReturnValue([]),
      setPreference: jest.fn().mockReturnValue({ theme: 'dark' }),
      getPreferences: jest.fn().mockReturnValue({ theme: 'dark' }),
    } as unknown as jest.Mocked<WorkspaceService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceGateway,
        { provide: QuickActionService, useValue: quickActionService },
        { provide: WorkspaceService, useValue: workspaceService },
      ],
    }).compile();

    gateway = module.get<WorkspaceGateway>(WorkspaceGateway);

    mockServer = createMockServer();
    gateway.server = mockServer;
  });

  // =========================================================================
  // afterInit
  // =========================================================================

  describe('afterInit', () => {
    it('should complete without errors', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  // =========================================================================
  // handleExecuteQuickAction
  // =========================================================================

  describe('handleExecuteQuickAction', () => {
    it('should delegate to quickActionService.executeAction', async () => {
      const client = createMockSocket();
      const action = makeQuickAction({ id: 'run-app', handler: 'terminal:execute' });
      const payload = {
        sessionId: 'session-1',
        action,
        context: { projectPath: '/project' },
      };

      await gateway.handleExecuteQuickAction(payload, client);

      expect(quickActionService.executeAction).toHaveBeenCalledWith('session-1', action, {
        projectPath: '/project',
      });
    });

    it('should emit result to the calling client', async () => {
      const client = createMockSocket();
      const action = makeQuickAction({ id: 'my-action', handler: 'terminal:execute' });
      const payload = {
        sessionId: 'session-1',
        action,
      };

      quickActionService.executeAction.mockResolvedValue({
        success: true,
        message: 'Command executed',
      });

      await gateway.handleExecuteQuickAction(payload, client);

      expect(client.emit).toHaveBeenCalledWith('quickaction:result', {
        actionId: 'my-action',
        handler: 'terminal:execute',
        success: true,
        message: 'Command executed',
      });
    });

    it('should return the result from quickActionService', async () => {
      const client = createMockSocket();
      const action = makeQuickAction();
      const expected: QuickActionResult = { success: false, error: 'oops' };
      quickActionService.executeAction.mockResolvedValue(expected);

      const result = await gateway.handleExecuteQuickAction({ sessionId: 's1', action }, client);

      expect(result).toEqual(expected);
    });
  });

  // =========================================================================
  // handleGetQuickActions
  // =========================================================================

  describe('handleGetQuickActions', () => {
    it('should return all quick actions when no filters', () => {
      const actions = [
        makeQuickAction({ id: 'a1', category: 'terminal' }),
        makeQuickAction({ id: 'a2', category: 'git' }),
      ];
      workspaceService.getQuickActions.mockReturnValue(actions);
      const client = createMockSocket();

      const result = gateway.handleGetQuickActions({}, client);

      expect(result).toEqual(actions);
    });

    it('should filter by category', () => {
      const actions = [
        makeQuickAction({ id: 'a1', category: 'terminal' }),
        makeQuickAction({ id: 'a2', category: 'git' }),
        makeQuickAction({ id: 'a3', category: 'terminal' }),
      ];
      workspaceService.getQuickActions.mockReturnValue(actions);
      const client = createMockSocket();

      const result = gateway.handleGetQuickActions({ category: 'terminal' }, client);

      expect(result).toHaveLength(2);
      expect(result.every(a => a.category === 'terminal')).toBe(true);
    });

    it('should filter by enabledOnly', () => {
      const actions = [
        makeQuickAction({ id: 'a1', enabled: true }),
        makeQuickAction({ id: 'a2', enabled: false }),
        makeQuickAction({ id: 'a3', enabled: true }),
      ];
      workspaceService.getQuickActions.mockReturnValue(actions);
      const client = createMockSocket();

      const result = gateway.handleGetQuickActions({ enabledOnly: true }, client);

      expect(result).toHaveLength(2);
      expect(result.every(a => a.enabled !== false)).toBe(true);
    });

    it('should apply both category and enabledOnly filters together', () => {
      const actions = [
        makeQuickAction({ id: 'a1', category: 'terminal', enabled: true }),
        makeQuickAction({ id: 'a2', category: 'terminal', enabled: false }),
        makeQuickAction({ id: 'a3', category: 'git', enabled: true }),
      ];
      workspaceService.getQuickActions.mockReturnValue(actions);
      const client = createMockSocket();

      const result = gateway.handleGetQuickActions(
        { category: 'terminal', enabledOnly: true },
        client
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a1');
    });
  });

  // =========================================================================
  // handleUpdateQuickActions
  // =========================================================================

  describe('handleUpdateQuickActions', () => {
    it('should set actions via workspaceService', () => {
      const client = createMockSocket();
      const actions = [makeQuickAction({ id: 'updated' })];

      gateway.handleUpdateQuickActions({ actions }, client);

      expect(workspaceService.setQuickActions).toHaveBeenCalledWith(actions);
    });

    it('should broadcast update to all clients via server.emit', () => {
      const client = createMockSocket();
      const actions = [makeQuickAction({ id: 'updated' })];

      gateway.handleUpdateQuickActions({ actions }, client);

      expect(mockServer.emit).toHaveBeenCalledWith('quickaction:updated', { actions });
    });

    it('should return success', () => {
      const client = createMockSocket();
      const result = gateway.handleUpdateQuickActions({ actions: [] }, client);

      expect(result).toEqual({ success: true });
    });
  });

  // =========================================================================
  // handleResetQuickActions
  // =========================================================================

  describe('handleResetQuickActions', () => {
    it('should reset via workspaceService', () => {
      const client = createMockSocket();

      gateway.handleResetQuickActions(client);

      expect(workspaceService.resetQuickActionsToDefaults).toHaveBeenCalled();
    });

    it('should broadcast the new defaults to all clients', () => {
      const defaults = [makeQuickAction({ id: 'default-1' })];
      workspaceService.getQuickActions.mockReturnValue(defaults);
      const client = createMockSocket();

      gateway.handleResetQuickActions(client);

      expect(mockServer.emit).toHaveBeenCalledWith('quickaction:updated', {
        actions: defaults,
      });
    });

    it('should return success with actions', () => {
      const defaults = [makeQuickAction({ id: 'default-1' })];
      workspaceService.getQuickActions.mockReturnValue(defaults);
      const client = createMockSocket();

      const result = gateway.handleResetQuickActions(client);

      expect(result).toEqual({ success: true, actions: defaults });
    });
  });

  // =========================================================================
  // handleGetWorkspaceState
  // =========================================================================

  describe('handleGetWorkspaceState', () => {
    it('should return full workspace state from service', () => {
      const state: WorkspaceState = {
        tabs: [makeTab()],
        activeTabId: 'tab-1',
        preferences: { theme: 'light' },
        quickActions: [makeQuickAction()],
      };
      workspaceService.getWorkspaceState.mockReturnValue(state);
      const client = createMockSocket();

      const result = gateway.handleGetWorkspaceState(client);

      expect(result).toEqual(state);
      expect(workspaceService.getWorkspaceState).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // handleSaveWorkspaceState
  // =========================================================================

  describe('handleSaveWorkspaceState', () => {
    it('should save partial state via workspaceService', () => {
      const client = createMockSocket();
      const payload = { activeTabId: 'tab-2' };

      const result = gateway.handleSaveWorkspaceState(payload, client);

      expect(workspaceService.saveWorkspaceState).toHaveBeenCalledWith(payload);
      expect(result).toEqual({ success: true });
    });

    it('should save tabs when provided', () => {
      const client = createMockSocket();
      const tabs = [makeTab({ id: 'tab-x' })];
      const payload = { tabs };

      gateway.handleSaveWorkspaceState(payload, client);

      expect(workspaceService.saveWorkspaceState).toHaveBeenCalledWith({ tabs });
    });
  });

  // =========================================================================
  // handleAddTab
  // =========================================================================

  describe('handleAddTab', () => {
    it('should create a ProjectTabDTO and add via service', () => {
      const client = createMockSocket();
      const tabs = [makeTab({ id: 'new-tab' })];
      workspaceService.addTab.mockReturnValue(tabs);
      workspaceService.getActiveTabId.mockReturnValue('new-tab');

      const result = gateway.handleAddTab(
        { id: 'new-tab', projectPath: '/project', name: 'My Project' },
        client
      );

      expect(workspaceService.addTab).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'new-tab',
          projectPath: '/project',
          name: 'My Project',
          sessionIds: [],
          isActive: true,
        })
      );
      expect(result.success).toBe(true);
      expect(result.tabs).toEqual(tabs);
      expect(result.activeTabId).toBe('new-tab');
    });

    it('should broadcast to other clients via client.broadcast.emit', () => {
      const client = createMockSocket();
      const tabs = [makeTab()];
      workspaceService.addTab.mockReturnValue(tabs);
      workspaceService.getActiveTabId.mockReturnValue('tab-1');

      gateway.handleAddTab({ id: 'tab-1', projectPath: '/proj', name: 'Proj' }, client);

      expect((client.broadcast as any).emit).toHaveBeenCalledWith('workspace:tabs-updated', {
        tabs,
        activeTabId: 'tab-1',
      });
    });

    it('should use payload.id as activeTabId when getActiveTabId returns null', () => {
      const client = createMockSocket();
      workspaceService.addTab.mockReturnValue([]);
      workspaceService.getActiveTabId.mockReturnValue(null);

      const result = gateway.handleAddTab(
        { id: 'fallback-tab', projectPath: '/p', name: 'P' },
        client
      );

      expect(result.activeTabId).toBe('fallback-tab');
    });

    it('should include theme in the constructed tab DTO', () => {
      const client = createMockSocket();
      workspaceService.addTab.mockReturnValue([]);
      workspaceService.getActiveTabId.mockReturnValue('t1');

      gateway.handleAddTab({ id: 't1', projectPath: '/p', name: 'P', theme: 'ocean' }, client);

      expect(workspaceService.addTab).toHaveBeenCalledWith(
        expect.objectContaining({ theme: 'ocean' })
      );
    });
  });

  // =========================================================================
  // handleUpdateTabTheme
  // =========================================================================

  describe('handleUpdateTabTheme', () => {
    it('should update theme via workspaceService', () => {
      const client = createMockSocket();
      const tabs = [makeTab({ id: 'tab-1', theme: 'sunset' })];
      workspaceService.updateTabTheme.mockReturnValue(tabs as any);
      workspaceService.getActiveTabId.mockReturnValue('tab-1');

      const result = gateway.handleUpdateTabTheme({ tabId: 'tab-1', theme: 'sunset' }, client);

      expect(workspaceService.updateTabTheme).toHaveBeenCalledWith('tab-1', 'sunset');
      expect(result).toEqual({ success: true, tabs });
    });

    it('should broadcast to other clients', () => {
      const client = createMockSocket();
      const tabs = [makeTab()];
      workspaceService.updateTabTheme.mockReturnValue(tabs as any);
      workspaceService.getActiveTabId.mockReturnValue('tab-1');

      gateway.handleUpdateTabTheme({ tabId: 'tab-1', theme: 'dark' }, client);

      expect((client.broadcast as any).emit).toHaveBeenCalledWith('workspace:tabs-updated', {
        tabs,
        activeTabId: 'tab-1',
      });
    });
  });

  // =========================================================================
  // handleRemoveTab
  // =========================================================================

  describe('handleRemoveTab', () => {
    it('should remove tab via workspaceService', () => {
      const client = createMockSocket();
      const removeResult = { tabs: [] as ProjectTabDTO[], activeTabId: null };
      workspaceService.removeTab.mockReturnValue(removeResult);

      const result = gateway.handleRemoveTab({ tabId: 'tab-1' }, client);

      expect(workspaceService.removeTab).toHaveBeenCalledWith('tab-1');
      expect(result).toEqual({ success: true, ...removeResult });
    });

    it('should broadcast to other clients', () => {
      const client = createMockSocket();
      const remaining = [makeTab({ id: 'tab-2' })];
      workspaceService.removeTab.mockReturnValue({
        tabs: remaining,
        activeTabId: 'tab-2',
      });

      gateway.handleRemoveTab({ tabId: 'tab-1' }, client);

      expect((client.broadcast as any).emit).toHaveBeenCalledWith('workspace:tabs-updated', {
        tabs: remaining,
        activeTabId: 'tab-2',
      });
    });
  });

  // =========================================================================
  // handleSelectTab
  // =========================================================================

  describe('handleSelectTab', () => {
    it('should select tab via workspaceService', () => {
      const client = createMockSocket();
      const tabs = [makeTab({ id: 'tab-1', isActive: true })];
      workspaceService.selectTab.mockReturnValue(tabs);

      const result = gateway.handleSelectTab({ tabId: 'tab-1' }, client);

      expect(workspaceService.selectTab).toHaveBeenCalledWith('tab-1');
      expect(result).toEqual({ success: true, tabs, activeTabId: 'tab-1' });
    });

    it('should broadcast to other clients', () => {
      const client = createMockSocket();
      const tabs = [makeTab({ id: 'tab-2' })];
      workspaceService.selectTab.mockReturnValue(tabs);

      gateway.handleSelectTab({ tabId: 'tab-2' }, client);

      expect((client.broadcast as any).emit).toHaveBeenCalledWith('workspace:tabs-updated', {
        tabs,
        activeTabId: 'tab-2',
      });
    });
  });

  // =========================================================================
  // handleUpdatePreference
  // =========================================================================

  describe('handleUpdatePreference', () => {
    it('should set preference via workspaceService', () => {
      const client = createMockSocket();
      const prefs: UserPreferences = { theme: 'light' };
      workspaceService.setPreference.mockReturnValue(prefs);

      const result = gateway.handleUpdatePreference({ key: 'theme', value: 'light' }, client);

      expect(workspaceService.setPreference).toHaveBeenCalledWith('theme', 'light');
      expect(result).toEqual({ success: true, preferences: prefs });
    });

    it('should broadcast preference update to other clients', () => {
      const client = createMockSocket();
      const prefs: UserPreferences = { theme: 'dark' };
      workspaceService.setPreference.mockReturnValue(prefs);

      gateway.handleUpdatePreference({ key: 'theme', value: 'dark' }, client);

      expect((client.broadcast as any).emit).toHaveBeenCalledWith('workspace:preferences-updated', {
        preferences: prefs,
      });
    });
  });

  // =========================================================================
  // handleGetPreferences
  // =========================================================================

  describe('handleGetPreferences', () => {
    it('should return preferences from workspaceService', () => {
      const client = createMockSocket();
      const prefs: UserPreferences = { theme: 'dark' };
      workspaceService.getPreferences.mockReturnValue(prefs);

      const result = gateway.handleGetPreferences(client);

      expect(result).toEqual(prefs);
      expect(workspaceService.getPreferences).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // onQuickActionExecuted (event handler)
  // =========================================================================

  describe('onQuickActionExecuted', () => {
    it('should broadcast the event to all clients via server.emit', () => {
      const event = {
        handler: 'terminal:execute',
        terminalId: 1,
        command: 'npm test',
      };

      gateway.onQuickActionExecuted(event);

      expect(mockServer.emit).toHaveBeenCalledWith('quickaction:executed', event);
    });

    it('should pass through all event properties', () => {
      const event = {
        handler: 'git:commit-push',
        repoPath: '/project',
        commitMessage: 'fix: bug',
        customField: 42,
      };

      gateway.onQuickActionExecuted(event);

      expect(mockServer.emit).toHaveBeenCalledWith('quickaction:executed', event);
    });
  });

  // =========================================================================
  // onAiPrompt (event handler)
  // =========================================================================

  describe('onAiPrompt', () => {
    it('should broadcast the AI prompt event to all clients', () => {
      const event = {
        sessionId: 'session-1',
        prompt: 'Fix the TypeScript errors',
        action: 'fix-errors',
        projectPath: '/project',
      };

      gateway.onAiPrompt(event);

      expect(mockServer.emit).toHaveBeenCalledWith('quickaction:ai:prompt', event);
    });

    it('should handle events without optional projectPath', () => {
      const event = {
        sessionId: 'session-2',
        prompt: 'Explain this code',
        action: 'explain',
      };

      gateway.onAiPrompt(event as any);

      expect(mockServer.emit).toHaveBeenCalledWith('quickaction:ai:prompt', event);
    });
  });
});
