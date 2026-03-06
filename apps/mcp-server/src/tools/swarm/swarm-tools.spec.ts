import { createMockConfig, createMockHttpClient, createMockLogger } from '../../../test/helpers';
import type { ToolDependencies } from '../types';
import { SwarmGetAssignmentTool } from './swarm-get-assignment.tool';
import { SwarmReportResultTool } from './swarm-report-result.tool';
import { SwarmClaimFilesTool } from './swarm-claim-files.tool';
import { SwarmReleaseFilesTool } from './swarm-release-files.tool';
import { SwarmSendMessageTool } from './swarm-send-message.tool';
import { SwarmGetMessagesTool } from './swarm-get-messages.tool';
import { SwarmGetContextTool } from './swarm-get-context.tool';
import { SwarmSpawnTeammateTool } from './swarm-spawn-teammate.tool';
import { SwarmCreateTaskTool } from './swarm-create-task.tool';

describe('swarm MCP tools', () => {
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;
  let deps: ToolDependencies;

  beforeEach(() => {
    mockHttpClient = createMockHttpClient();
    deps = {
      httpClient: mockHttpClient,
      config: createMockConfig({ swarmId: 'swarm-1', swarmRole: 'builder' }),
      logger: createMockLogger(),
    };
  });

  it('returns an assignment when one is available', async () => {
    mockHttpClient.swarmGetAssignment.mockResolvedValue({
      id: 'task-1',
      swarmId: 'swarm-1',
      subject: 'Build feature',
      status: 'assigned',
      dependsOn: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const tool = new SwarmGetAssignmentTool(deps);
    const result = await tool.execute({});

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain('"id": "task-1"');
  });

  it('reports results through the HTTP client', async () => {
    const tool = new SwarmReportResultTool(deps);

    await tool.execute({ taskId: 'task-1', result: 'done', status: 'completed' });

    expect(mockHttpClient.swarmReportResult).toHaveBeenCalledWith('task-1', 'done', 'completed');
  });

  it('claims and releases files through the HTTP client', async () => {
    const claimTool = new SwarmClaimFilesTool(deps);
    const releaseTool = new SwarmReleaseFilesTool(deps);

    await claimTool.execute({ files: ['src/app.ts'] });
    await releaseTool.execute({ files: ['src/app.ts'] });

    expect(mockHttpClient.swarmClaimFiles).toHaveBeenCalledWith(['src/app.ts']);
    expect(mockHttpClient.swarmReleaseFiles).toHaveBeenCalledWith(['src/app.ts']);
  });

  it('sends and fetches messages through the HTTP client', async () => {
    mockHttpClient.swarmGetMessages.mockResolvedValue([
      {
        id: 'msg-1',
        swarmId: 'swarm-1',
        fromAgentId: 'agent-1',
        toAgentId: 'all',
        content: 'Heads up',
        type: 'info',
        timestamp: new Date().toISOString(),
        read: false,
      },
    ]);

    const sendTool = new SwarmSendMessageTool(deps);
    const getTool = new SwarmGetMessagesTool(deps);

    await sendTool.execute({ toAgentId: 'all', content: 'Heads up', type: 'info' });
    const result = await getTool.execute({});

    expect(mockHttpClient.swarmSendMessage).toHaveBeenCalledWith('all', 'Heads up', 'info');
    expect(result.content[0]?.text).toContain('Heads up');
  });

  it('returns the full swarm context', async () => {
    mockHttpClient.swarmGetContext.mockResolvedValue({
      swarm: {
        id: 'swarm-1',
        name: 'Test Swarm',
        goal: 'Ship it',
        projectPath: '/project',
        status: 'active',
        strategy: 'hierarchical',
        roles: [{ role: 'lead', count: 1 }],
        memberSessionIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      agents: [],
      tasks: [],
      recentMessages: [],
    });

    const tool = new SwarmGetContextTool(deps);
    const result = await tool.execute({});

    expect(result.content[0]?.text).toContain('"name": "Test Swarm"');
  });

  it('blocks spawn/create-task when the session is not the lead', async () => {
    const spawnTool = new SwarmSpawnTeammateTool(deps);
    const createTaskTool = new SwarmCreateTaskTool(deps);

    const spawnResult = await spawnTool.execute({ role: 'builder' });
    const taskResult = await createTaskTool.execute({ subject: 'Create task' });

    expect(spawnResult.isError).toBe(true);
    expect(spawnResult.content[0]?.text).toContain('Only the lead agent');
    expect(taskResult.isError).toBe(true);
    expect(taskResult.content[0]?.text).toContain('Only the lead agent');
    expect(mockHttpClient.swarmSpawnTeammate).not.toHaveBeenCalled();
    expect(mockHttpClient.swarmCreateTask).not.toHaveBeenCalled();
  });

  it('allows the lead to spawn teammates and create tasks', async () => {
    const leadDeps: ToolDependencies = {
      ...deps,
      config: createMockConfig({ swarmId: 'swarm-1', swarmRole: 'lead' }),
    };

    const spawnTool = new SwarmSpawnTeammateTool(leadDeps);
    const createTaskTool = new SwarmCreateTaskTool(leadDeps);

    const spawnResult = await spawnTool.execute({ role: 'builder', taskDescription: 'Build it' });
    const taskResult = await createTaskTool.execute({
      subject: 'Build it',
      description: 'Implement the feature',
      assignedRole: 'builder',
      dependsOn: ['task-1'],
    });

    expect(mockHttpClient.swarmSpawnTeammate).toHaveBeenCalledWith('builder', 'Build it');
    expect(mockHttpClient.swarmCreateTask).toHaveBeenCalledWith(
      'Build it',
      'Implement the feature',
      'builder',
      ['task-1']
    );
    expect(spawnResult.content[0]?.text).toContain('mock-agent-id');
    expect(taskResult.content[0]?.text).toContain('mock-task-id');
  });

  it('rejects the lead role in spawn and create-task schemas', () => {
    const spawnTool = new SwarmSpawnTeammateTool(deps);
    const createTaskTool = new SwarmCreateTaskTool(deps);

    expect(spawnTool.inputSchema.role.safeParse('lead').success).toBe(false);
    expect(createTaskTool.inputSchema.assignedRole.safeParse('lead').success).toBe(false);
  });
});
