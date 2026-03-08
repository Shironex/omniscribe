import { createMockConfig, createMockHttpClient, createMockLogger } from '../../../test/helpers';
import type { ToolDependencies } from '../types';
import { SwarmSpawnTeammateTool } from './swarm-spawn-teammate.tool';

describe('SwarmSpawnTeammateTool', () => {
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

  it('blocks spawn when the session is not the lead', async () => {
    const tool = new SwarmSpawnTeammateTool(deps);

    const result = await tool.execute({ role: 'builder' });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Only the lead agent');
    expect(mockHttpClient.swarmSpawnTeammate).not.toHaveBeenCalled();
  });

  it('allows the lead to spawn teammates', async () => {
    const leadDeps: ToolDependencies = {
      ...deps,
      config: createMockConfig({ swarmId: 'swarm-1', swarmRole: 'lead' }),
    };

    const tool = new SwarmSpawnTeammateTool(leadDeps);

    const result = await tool.execute({ role: 'builder', taskDescription: 'Build it' });

    expect(mockHttpClient.swarmSpawnTeammate).toHaveBeenCalledWith('builder', 'Build it');
    expect(result.content[0]?.text).toContain('mock-agent-id');
  });

  it('rejects the lead role in the input schema', () => {
    const tool = new SwarmSpawnTeammateTool(deps);

    expect(tool.inputSchema.role.safeParse('lead').success).toBe(false);
  });
});
