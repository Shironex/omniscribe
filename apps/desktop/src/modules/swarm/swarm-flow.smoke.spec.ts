import { EventEmitter2 } from '@nestjs/event-emitter';
import { SwarmService } from './swarm.service';
import { SwarmTaskService } from './swarm-task.service';
import { SwarmMessagingService } from './swarm-messaging.service';

describe('Swarm flow smoke test', () => {
  it('covers create, spawn, assign, message, report, and completion', async () => {
    const eventEmitter = new EventEmitter2();
    const taskService = new SwarmTaskService(eventEmitter);
    const messagingService = new SwarmMessagingService(eventEmitter);

    let sessionCounter = 0;
    const sessionService = {
      create: jest.fn((_mode: string, projectPath: string, options: any) => {
        sessionCounter += 1;
        return {
          id: `session-${sessionCounter}`,
          workingDirectory: projectPath,
          ...options,
        };
      }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const sessionLauncherService = {
      launchSession: jest.fn().mockResolvedValue({ success: true, terminalSessionId: 1 }),
    };
    const swarmFileService = {
      initSwarmDirectory: jest.fn().mockResolvedValue(undefined),
      cleanupSwarmDirectory: jest.fn().mockResolvedValue(undefined),
      writeState: jest.fn().mockResolvedValue(undefined),
      writeAgent: jest.fn().mockResolvedValue(undefined),
      writeTasks: jest.fn().mockResolvedValue(undefined),
      writeMessages: jest.fn().mockResolvedValue(undefined),
      writeFileLocks: jest.fn().mockResolvedValue(undefined),
    };
    const swarmFileWatcherService = {
      startWatching: jest.fn(),
      stopWatching: jest.fn(),
      ensureAgentsWatcher: jest.fn(),
    };

    const swarmService = new SwarmService(
      eventEmitter,
      sessionService as any,
      sessionLauncherService as any,
      taskService,
      messagingService,
      swarmFileService as any,
      swarmFileWatcherService as any
    );

    const swarm = await swarmService.create({
      name: 'Smoke Swarm',
      goal: 'Ship the feature',
      projectPath: '/project',
      roles: [
        { role: 'lead', count: 1 },
        { role: 'builder', count: 1 },
      ],
    });

    const builder = await swarmService.spawnTeammate(swarm.id, 'builder', 'Implement the feature');
    const lead = swarmService.getAgentsForSwarm(swarm.id).find(agent => agent.role === 'lead');

    const task = taskService.createTask(swarm.id, {
      subject: 'Implement feature',
      assignedRole: 'builder',
    });
    const assignment = taskService.getAssignment(swarm.id, builder.id, builder.role);
    swarmService.addTaskToAgent(swarm.id, builder.id, assignment!.id);

    messagingService.sendMessage(
      swarm.id,
      lead!.id,
      builder.id,
      'Please start implementation',
      'info'
    );
    expect(messagingService.getMessages(swarm.id, builder.id)).toHaveLength(1);

    const reportedTask = taskService.reportResult(
      swarm.id,
      task.id,
      builder.id,
      'Implemented successfully',
      'completed'
    );

    expect(reportedTask?.status).toBe('completed');
    const context = swarmService.getSwarmContext(swarm.id);
    expect(context?.tasks[0]?.result).toBe('Implemented successfully');
    expect(context?.recentMessages).toHaveLength(1);

    swarmService.handleSessionRemoved({ sessionId: lead!.sessionId });
    swarmService.handleSessionRemoved({ sessionId: builder.sessionId });

    expect(swarmService.getSwarm(swarm.id)?.status).toBe('done');

    const cleanupTimer = (swarmService as any).cleanupTimers.get(swarm.id) as
      | NodeJS.Timeout
      | undefined;
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
    }
  });
});
