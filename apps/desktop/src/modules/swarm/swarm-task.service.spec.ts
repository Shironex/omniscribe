import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  MAX_SWARM_TASK_SUBJECT_LENGTH,
  MAX_SWARM_TASK_TEXT_LENGTH,
  type SwarmTask,
} from '@omniscribe/shared';
import { SwarmTaskService } from './swarm-task.service';

describe('SwarmTaskService', () => {
  let service: SwarmTaskService;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(() => {
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new SwarmTaskService(eventEmitter);
  });

  it('creates pending tasks without dependencies', () => {
    const task = service.createTask('swarm-1', {
      subject: ' Implement feature ',
      description: ' Add tests ',
      assignedRole: 'builder',
    });

    expect(task.status).toBe('pending');
    expect(task.subject).toBe('Implement feature');
    expect(task.description).toBe('Add tests');
    expect(service.getTasksForSwarm('swarm-1')).toEqual([task]);
    expect(eventEmitter.emit).toHaveBeenCalledWith('swarm.task.updated', {
      swarmId: 'swarm-1',
      task,
    });
  });

  it('creates blocked tasks when dependencies are present', () => {
    const dependency = service.createTask('swarm-1', { subject: 'First task' });
    const task = service.createTask('swarm-1', {
      subject: 'Second task',
      dependsOn: [dependency.id],
    });

    expect(task.status).toBe('blocked');
    expect(task.dependsOn).toEqual([dependency.id]);
  });

  it('rejects unknown dependencies', () => {
    expect(() =>
      service.createTask('swarm-1', {
        subject: 'Invalid task',
        dependsOn: ['missing-task'],
      })
    ).toThrow('Unknown dependency: missing-task');
  });

  it('rejects dependency cycles in existing data', () => {
    const existingTasks: SwarmTask[] = [
      {
        id: 'task-a',
        swarmId: 'swarm-1',
        subject: 'Task A',
        status: 'blocked',
        dependsOn: ['task-b'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'task-b',
        swarmId: 'swarm-1',
        subject: 'Task B',
        status: 'pending',
        dependsOn: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    (service as unknown as { tasks: Map<string, SwarmTask[]> }).tasks.set('swarm-1', existingTasks);

    expect(() =>
      service.createTask('swarm-1', {
        subject: 'Task C',
        dependsOn: ['task-a'],
      })
    ).not.toThrow();

    existingTasks[1]!.dependsOn = ['task-a'];

    expect(() =>
      service.createTask('swarm-1', {
        subject: 'Task D',
        dependsOn: ['task-b'],
      })
    ).toThrow('Task dependencies would create a cycle');
  });

  it('validates subject and description length', () => {
    expect(() =>
      service.createTask('swarm-1', {
        subject: 'x'.repeat(MAX_SWARM_TASK_SUBJECT_LENGTH + 1),
      })
    ).toThrow(`Task subject exceeds maximum length of ${MAX_SWARM_TASK_SUBJECT_LENGTH}`);

    expect(() =>
      service.createTask('swarm-1', {
        subject: 'Valid subject',
        description: 'x'.repeat(MAX_SWARM_TASK_TEXT_LENGTH + 1),
      })
    ).toThrow(`Task description exceeds maximum length of ${MAX_SWARM_TASK_TEXT_LENGTH}`);
  });

  it('assigns the next matching task for an agent role', () => {
    const builderTask = service.createTask('swarm-1', {
      subject: 'Build it',
      assignedRole: 'builder',
    });
    service.createTask('swarm-1', {
      subject: 'Review it',
      assignedRole: 'reviewer',
    });

    const assignment = service.getAssignment('swarm-1', 'agent-1', 'builder');

    expect(assignment?.id).toBe(builderTask.id);
    expect(assignment?.status).toBe('assigned');
    expect(assignment?.assignedTo).toBe('agent-1');
  });

  it('reports results, enforces reporter ownership, and unblocks dependencies', () => {
    const dependency = service.createTask('swarm-1', { subject: 'Task 1' });
    const dependent = service.createTask('swarm-1', {
      subject: 'Task 2',
      dependsOn: [dependency.id],
    });

    service.getAssignment('swarm-1', 'agent-1', undefined);

    expect(() =>
      service.reportResult('swarm-1', dependency.id, 'agent-2', 'done', 'completed')
    ).toThrow('Only the assigned agent can report this task result');

    const reported = service.reportResult(
      'swarm-1',
      dependency.id,
      'agent-1',
      ' done ',
      'completed'
    );

    expect(reported?.status).toBe('completed');
    expect(reported?.result).toBe('done');
    expect(service.getTasksForSwarm('swarm-1').find(task => task.id === dependent.id)?.status).toBe(
      'pending'
    );
  });

  it('claims and releases normalized file locks', () => {
    const first = service.claimFiles('swarm-1', 'agent-1', ['src\\app.ts', '../bad.ts']);
    expect(first).toEqual({ claimed: ['src\\app.ts'], denied: ['../bad.ts'] });

    const second = service.claimFiles('swarm-1', 'agent-2', ['src/app.ts']);
    expect(second).toEqual({ claimed: [], denied: ['src/app.ts'] });

    service.releaseFiles('swarm-1', 'agent-1', ['src/app.ts']);

    const third = service.claimFiles('swarm-1', 'agent-2', ['src/app.ts']);
    expect(third).toEqual({ claimed: ['src/app.ts'], denied: [] });
  });

  it('cleans up tasks and file locks for a swarm', () => {
    const task = service.createTask('swarm-1', { subject: 'Cleanup me' });
    expect(task).toBeDefined();
    service.claimFiles('swarm-1', 'agent-1', ['src/app.ts']);

    service.cleanup('swarm-1');

    expect(service.getTasksForSwarm('swarm-1')).toEqual([]);
    expect(service.claimFiles('swarm-1', 'agent-2', ['src/app.ts'])).toEqual({
      claimed: ['src/app.ts'],
      denied: [],
    });
  });
});
