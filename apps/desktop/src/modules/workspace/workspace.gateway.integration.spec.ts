/**
 * Workspace Gateway Integration Tests
 *
 * Tests workspace state, tab management, preferences, and quick action flows
 * with a real NestJS application and real socket.io connections.
 * WorkspaceService and QuickActionService are mocked at the service boundary.
 */
import { Module, INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Socket } from 'socket.io-client';
import { createTestApp, getAppPort } from '../../../test/integration/helpers/create-test-app';
import {
  createSocketClient,
  connectClient,
  waitForEvent,
  emitWithAck,
} from '../../../test/integration/helpers/socket-client';
import { WorkspaceGateway } from './workspace.gateway';
import { WorkspaceService } from './workspace.service';
import { QuickActionService } from './quick-action.service';

const mockTabs = [
  {
    id: 'tab-1',
    projectPath: '/tmp/project',
    name: 'Test Project',
    sessionIds: [],
    isActive: true,
    lastAccessedAt: new Date().toISOString(),
  },
];

const mockPreferences = { theme: 'dark' };

describe('WorkspaceGateway (integration)', () => {
  let app: INestApplication;
  let client: Socket;
  let mockWorkspaceService: Record<string, jest.Mock>;

  beforeAll(async () => {
    mockWorkspaceService = {
      getWorkspaceState: jest.fn().mockReturnValue({
        tabs: mockTabs,
        activeTabId: 'tab-1',
        preferences: mockPreferences,
        quickActions: [],
      }),
      saveWorkspaceState: jest.fn(),
      addTab: jest.fn().mockReturnValue(mockTabs),
      removeTab: jest.fn().mockReturnValue({ tabs: [], activeTabId: null }),
      selectTab: jest.fn().mockReturnValue(mockTabs),
      updateTabTheme: jest.fn().mockReturnValue(mockTabs),
      getActiveTabId: jest.fn().mockReturnValue('tab-1'),
      getPreferences: jest.fn().mockReturnValue(mockPreferences),
      setPreference: jest.fn().mockReturnValue({ ...mockPreferences, fontSize: 14 }),
      getQuickActions: jest.fn().mockReturnValue([
        {
          id: 'run-app',
          title: 'Run App',
          handler: 'terminal:execute',
          category: 'terminal',
          enabled: true,
        },
      ]),
      setQuickActions: jest.fn(),
      resetQuickActionsToDefaults: jest.fn(),
    };

    const mockQuickActionService = {
      executeAction: jest.fn().mockResolvedValue({ success: true, message: 'Action executed' }),
    };

    @Module({
      providers: [
        WorkspaceGateway,
        { provide: WorkspaceService, useValue: mockWorkspaceService },
        { provide: QuickActionService, useValue: mockQuickActionService },
      ],
    })
    class TestWorkspaceModule {}

    app = await createTestApp({
      modules: [TestWorkspaceModule],
    });
  });

  afterAll(async () => {
    client?.disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    client = createSocketClient(getAppPort(app));
    await connectClient(client);
  });

  afterEach(() => {
    client?.disconnect();
  });

  it('should handle workspace:get-state and return workspace state', async () => {
    const response = await emitWithAck<any>(client, 'workspace:get-state', {});

    expect(response.tabs).toHaveLength(1);
    expect(response.activeTabId).toBe('tab-1');
    expect(response.preferences).toEqual(mockPreferences);
    expect(mockWorkspaceService.getWorkspaceState).toHaveBeenCalled();
  });

  it('should handle workspace:save-state and return success', async () => {
    const response = await emitWithAck<{ success: boolean }>(client, 'workspace:save-state', {
      tabs: mockTabs,
      activeTabId: 'tab-1',
    });

    expect(response.success).toBe(true);
    expect(mockWorkspaceService.saveWorkspaceState).toHaveBeenCalled();
  });

  it('should handle workspace:add-tab and return updated tabs', async () => {
    const response = await emitWithAck<{ success: boolean; tabs: any[]; activeTabId: string }>(
      client,
      'workspace:add-tab',
      {
        id: 'tab-2',
        projectPath: '/tmp/project2',
        name: 'Project 2',
      }
    );

    expect(response.success).toBe(true);
    expect(response.tabs).toHaveLength(1);
    expect(mockWorkspaceService.addTab).toHaveBeenCalled();
  });

  it('should handle workspace:select-tab and return updated tabs', async () => {
    const response = await emitWithAck<{ success: boolean; tabs: any[]; activeTabId: string }>(
      client,
      'workspace:select-tab',
      { tabId: 'tab-1' }
    );

    expect(response.success).toBe(true);
    expect(response.activeTabId).toBe('tab-1');
    expect(mockWorkspaceService.selectTab).toHaveBeenCalledWith('tab-1');
  });

  it('should handle workspace:get-preferences and return preferences', async () => {
    const response = await emitWithAck<any>(client, 'workspace:get-preferences', {});

    expect(response).toEqual(mockPreferences);
  });

  it('should handle quickaction:list and return quick actions', async () => {
    const response = await emitWithAck<any[]>(client, 'quickaction:list', {});

    expect(Array.isArray(response)).toBe(true);
    expect(response.length).toBe(1);
    expect(response[0].id).toBe('run-app');
  });

  it('should broadcast quickaction:executed when quickaction.executed event is emitted', async () => {
    const executedPromise = waitForEvent<{ handler: string }>(client, 'quickaction:executed');

    const eventEmitter = app.get(EventEmitter2);
    eventEmitter.emit('quickaction.executed', {
      handler: 'terminal:execute',
      terminalId: 1,
      command: 'npm run dev',
    });

    const executed = await executedPromise;
    expect(executed.handler).toBe('terminal:execute');
  });
});
