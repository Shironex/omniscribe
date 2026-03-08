import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MAX_SWARM_AGENTS,
  MAX_SWARM_GOAL_LENGTH,
  MAX_SWARM_NAME_LENGTH,
  type CreateSwarmPayload,
} from '@omniscribe/shared';
import { SwarmService } from './swarm.service';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';
import { SwarmFileService } from './swarm-file.service';
import { SwarmFileWatcherService } from './swarm-file-watcher.service';

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
  let swarmFileService: jest.Mocked<
    Pick<
      SwarmFileService,
      | 'initSwarmDirectory'
      | 'cleanupSwarmDirectory'
      | 'writeState'
      | 'writeAgent'
      | 'writeTasks'
      | 'writeMessages'
    >
  >;
  let swarmFileWatcherService: jest.Mocked<
    Pick<SwarmFileWatcherService, 'startWatching' | 'stopWatching' | 'ensureAgentsWatcher'>
  >;

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

    swarmFileService = {
      initSwarmDirectory: jest.fn().mockResolvedValue(undefined),
      cleanupSwarmDirectory: jest.fn().mockResolvedValue(undefined),
      writeState: jest.fn().mockResolvedValue(undefined),
      writeAgent: jest.fn().mockResolvedValue(undefined),
      writeTasks: jest.fn().mockResolvedValue(undefined),
      writeMessages: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<
        SwarmFileService,
        | 'initSwarmDirectory'
        | 'cleanupSwarmDirectory'
        | 'writeState'
        | 'writeAgent'
        | 'writeTasks'
        | 'writeMessages'
      >
    >;

    swarmFileWatcherService = {
      startWatching: jest.fn(),
      stopWatching: jest.fn(),
      ensureAgentsWatcher: jest.fn(),
    } as unknown as jest.Mocked<
      Pick<SwarmFileWatcherService, 'startWatching' | 'stopWatching' | 'ensureAgentsWatcher'>
    >;

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
      swarmFileService as any,
      swarmFileWatcherService as any
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

  it('spawns teammates and transitions to active', async () => {
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
    expect(swarmFileService.writeAgent).toHaveBeenCalled();
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

  // ============================================
  // Close (fully remove) swarm tests
  // ============================================

  describe('close (fully remove swarm)', () => {
    it('closes a done swarm and removes it from the store', async () => {
      const swarm = await service.create(createPayload());

      // Move to done state by removing the only agent session
      service.handleSessionRemoved({ sessionId: 'session-1' });
      expect(service.getSwarm(swarm.id)?.status).toBe('done');

      // Close the swarm fully
      await service.close(swarm.id);

      // Swarm should be completely removed from the store
      expect(service.getSwarm(swarm.id)).toBeUndefined();
      expect(service.getAgentsForSwarm(swarm.id)).toHaveLength(0);
    });

    it('closes a cancelled swarm and removes it from the store', async () => {
      const swarm = await service.create(createPayload());
      await service.cancel(swarm.id);
      expect(service.getSwarm(swarm.id)?.status).toBe('cancelled');

      await service.close(swarm.id);

      expect(service.getSwarm(swarm.id)).toBeUndefined();
    });

    it('closes an errored swarm and removes it from the store', async () => {
      // Simulate error by making session launch fail
      sessionLauncherService.launchSession.mockResolvedValueOnce({
        success: false,
        error: 'Launch failed',
      });
      const swarm = await service.create(createPayload());
      expect(service.getSwarm(swarm.id)?.status).toBe('error');

      await service.close(swarm.id);

      expect(service.getSwarm(swarm.id)).toBeUndefined();
    });

    it('rejects closing a swarm that is still active', async () => {
      const swarm = await service.create(
        createPayload({
          roles: [
            { role: 'lead', count: 1 },
            { role: 'builder', count: 1 },
          ],
        })
      );
      await service.spawnTeammate(swarm.id, 'builder', 'Build feature');
      expect(service.getAgentsForSwarm(swarm.id)).toHaveLength(2);
      expect(service.getSwarm(swarm.id)?.status).toBe('active');

      // close() should reject non-terminal swarms
      await expect(service.close(swarm.id)).rejects.toThrow(/Cannot close swarm/);

      // Swarm should still exist
      expect(service.getSwarm(swarm.id)).toBeDefined();
      expect(service.getAgentsForSwarm(swarm.id)).toHaveLength(2);
    });

    it('cleans up watchers, tasks, messages, and disk directory on close', async () => {
      const swarm = await service.create(createPayload());
      service.handleSessionRemoved({ sessionId: 'session-1' });

      await service.close(swarm.id);

      expect(swarmFileWatcherService.stopWatching).toHaveBeenCalledWith(swarm.id);
      expect(swarmTaskService.cleanup).toHaveBeenCalledWith(swarm.id);
      expect(swarmMessagingService.cleanup).toHaveBeenCalledWith(swarm.id);
      expect(swarmFileService.cleanupSwarmDirectory).toHaveBeenCalledWith('/project', swarm.id);
    });

    it('emits REMOVED internal event on close', async () => {
      const swarm = await service.create(createPayload());
      service.handleSessionRemoved({ sessionId: 'session-1' });

      // Clear previous emit calls
      eventEmitter.emit.mockClear();

      await service.close(swarm.id);

      const removedCall = eventEmitter.emit.mock.calls.find(([event]) => event === 'swarm.removed');
      expect(removedCall).toBeTruthy();
      expect(removedCall?.[1]).toEqual({ swarmId: swarm.id });
    });

    it('throws when closing a non-existent swarm', async () => {
      await expect(service.close('non-existent')).rejects.toThrow();
    });

    it('does not appear in getSwarms() after close', async () => {
      const swarm = await service.create(createPayload());
      service.handleSessionRemoved({ sessionId: 'session-1' });

      await service.close(swarm.id);

      expect(service.getSwarms()).toHaveLength(0);
    });

    it('cancels any pending cleanup timer when close is called explicitly', async () => {
      const swarm = await service.create(createPayload());
      // Move to done which schedules a delayed cleanup
      service.handleSessionRemoved({ sessionId: 'session-1' });
      expect(service.getSwarm(swarm.id)?.status).toBe('done');

      // Close immediately - should cancel the scheduled cleanup timer
      await service.close(swarm.id);

      expect(service.getSwarm(swarm.id)).toBeUndefined();
    });
  });
});
