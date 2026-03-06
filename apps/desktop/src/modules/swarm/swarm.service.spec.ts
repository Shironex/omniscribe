import { EventEmitter2 } from '@nestjs/event-emitter';
import { ModuleRef } from '@nestjs/core';
import {
  MAX_SWARM_AGENTS,
  MAX_SWARM_GOAL_LENGTH,
  MAX_SWARM_NAME_LENGTH,
  type CreateSwarmPayload,
} from '@omniscribe/shared';
import { SwarmService } from './swarm.service';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';

describe('SwarmService', () => {
  let service: SwarmService;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let sessionService: {
    create: jest.Mock;
    remove: jest.Mock;
  };
  let sessionLauncherService: {
    launchSession: jest.Mock;
  };
  let swarmTaskService: jest.Mocked<
    Pick<SwarmTaskService, 'cleanup' | 'releaseFiles' | 'getTasksForSwarm'>
  >;
  let swarmMessagingService: jest.Mocked<
    Pick<SwarmMessagingService, 'cleanup' | 'getRecentMessages'>
  >;
  let moduleRef: jest.Mocked<ModuleRef>;
  let statusServer: {
    waitForSessionMcpReady: jest.Mock;
    clearSessionMcpReady: jest.Mock;
  };

  beforeEach(() => {
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    sessionService = {
      create: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    sessionLauncherService = {
      launchSession: jest.fn().mockResolvedValue({ success: true, terminalSessionId: 1 }),
    };

    swarmTaskService = {
      cleanup: jest.fn(),
      releaseFiles: jest.fn(),
      getTasksForSwarm: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<
      Pick<SwarmTaskService, 'cleanup' | 'releaseFiles' | 'getTasksForSwarm'>
    >;

    swarmMessagingService = {
      cleanup: jest.fn(),
      getRecentMessages: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<Pick<SwarmMessagingService, 'cleanup' | 'getRecentMessages'>>;

    statusServer = {
      waitForSessionMcpReady: jest.fn().mockResolvedValue(true),
      clearSessionMcpReady: jest.fn(),
    };

    moduleRef = {
      get: jest.fn().mockReturnValue(statusServer),
    } as unknown as jest.Mocked<ModuleRef>;

    let sessionCounter = 0;
    sessionService.create.mockImplementation((_mode: string, projectPath: string, options: any) => {
      sessionCounter += 1;
      return {
        id: `session-${sessionCounter}`,
        workingDirectory: projectPath,
        ...options,
      };
    });

    service = new SwarmService(
      eventEmitter,
      sessionService as any,
      sessionLauncherService as any,
      swarmTaskService as any,
      swarmMessagingService as any,
      moduleRef
    );
  });

  function createPayload(overrides: Partial<CreateSwarmPayload> = {}): CreateSwarmPayload {
    return {
      name: 'Test Swarm',
      goal: 'Ship the feature',
      projectPath: '/project',
      roles: [{ role: 'lead', count: 1 }],
      ...overrides,
    };
  }

  it('creates a swarm, launches the lead, and moves to planning', async () => {
    const swarm = await service.create(createPayload());

    expect(swarm.status).toBe('planning');
    expect(swarm.leadSessionId).toBe('session-1');
    expect(service.getAgentsForSwarm(swarm.id)).toHaveLength(1);
    expect(sessionLauncherService.launchSession).toHaveBeenCalledWith(
      'session-1',
      '/project',
      '/project',
      'claude'
    );
  });

  it('rejects invalid name, goal, and agent counts', async () => {
    await expect(
      service.create(createPayload({ name: 'x'.repeat(MAX_SWARM_NAME_LENGTH + 1) }))
    ).rejects.toThrow(`Swarm name exceeds maximum length of ${MAX_SWARM_NAME_LENGTH}`);

    await expect(
      service.create(createPayload({ goal: 'x'.repeat(MAX_SWARM_GOAL_LENGTH + 1) }))
    ).rejects.toThrow(`Swarm goal exceeds maximum length of ${MAX_SWARM_GOAL_LENGTH}`);

    await expect(
      service.create({
        ...createPayload(),
        roles: [
          { role: 'lead', count: 1 },
          { role: 'builder', count: MAX_SWARM_AGENTS },
        ],
      })
    ).rejects.toThrow(
      `Total agent count (${MAX_SWARM_AGENTS + 1}) exceeds maximum of ${MAX_SWARM_AGENTS}`
    );
  });

  it('spawns teammates and waits for MCP readiness', async () => {
    const swarm = await service.create(
      createPayload({
        roles: [
          { role: 'lead', count: 1 },
          { role: 'builder', count: 1 },
        ],
      })
    );

    const teammate = await service.spawnTeammate(swarm.id, 'builder', 'Build the feature');

    expect(teammate.role).toBe('builder');
    expect(service.getAgentsForSwarm(swarm.id)).toHaveLength(2);
    expect(statusServer.waitForSessionMcpReady).toHaveBeenCalledWith('session-2', 20000);
    expect(service.getSwarm(swarm.id)?.status).toBe('active');
  });

  it('adds assigned task ids only once per agent', async () => {
    const swarm = await service.create(createPayload());
    const [agent] = service.getAgentsForSwarm(swarm.id);

    service.addTaskToAgent(swarm.id, agent!.id, 'task-1');
    service.addTaskToAgent(swarm.id, agent!.id, 'task-1');

    expect(service.getAgentsForSwarm(swarm.id)[0]?.assignedTaskIds).toEqual(['task-1']);
  });

  it('maps session status updates onto swarm agent status', async () => {
    const swarm = await service.create(createPayload());
    const [agent] = service.getAgentsForSwarm(swarm.id);

    service.handleSessionStatusChange({
      sessionId: agent!.sessionId,
      status: 'needs_input',
    } as any);
    expect(service.getAgentsForSwarm(swarm.id)[0]?.status).toBe('idle');

    service.handleSessionStatusChange({ sessionId: agent!.sessionId, status: 'error' } as any);
    expect(service.getAgentsForSwarm(swarm.id)[0]?.status).toBe('error');
  });

  it('handles removed sessions by releasing files and completing the swarm', async () => {
    const swarm = await service.create(createPayload());
    const [agent] = service.getAgentsForSwarm(swarm.id);

    service.handleSessionRemoved({ sessionId: agent!.sessionId });

    expect(swarmTaskService.releaseFiles).toHaveBeenCalledWith(swarm.id, agent!.id);
    expect(service.getAgentsForSwarm(swarm.id)[0]?.status).toBe('stopped');
    expect(service.getSwarm(swarm.id)?.status).toBe('done');
  });

  it('cancels a swarm and cleans up task/message state', async () => {
    const swarm = await service.create(createPayload());

    await service.cancel(swarm.id);

    expect(sessionService.remove).toHaveBeenCalledWith('session-1');
    expect(swarmTaskService.cleanup).toHaveBeenCalledWith(swarm.id);
    expect(swarmMessagingService.cleanup).toHaveBeenCalledWith(swarm.id);
    expect(service.getSwarm(swarm.id)?.status).toBe('cancelled');
  });
});
