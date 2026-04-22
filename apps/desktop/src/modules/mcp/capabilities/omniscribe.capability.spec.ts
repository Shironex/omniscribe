import { MCP_SERVER_NAME } from '@omniscribe/shared';
import { createOmniscribeCapability } from './omniscribe.capability';
import { McpInternalService } from '../services/mcp-internal.service';
import type { CapabilityBuildContext } from './capability.types';

function makeCtx(overrides: Partial<CapabilityBuildContext> = {}): CapabilityBuildContext {
  return {
    sessionId: 'session-1',
    workingDir: '/work',
    projectPath: '/project',
    projectHash: 'abcdef012345',
    statusUrl: 'http://127.0.0.1:9900/status',
    instanceId: 'test-instance',
    ...overrides,
  };
}

describe('createOmniscribeCapability', () => {
  it('exposes the omniscribe metadata', () => {
    const internal = {
      getPath: jest.fn().mockReturnValue('/path/to/index.cjs'),
    } as unknown as McpInternalService;
    const cap = createOmniscribeCapability(internal);

    expect(cap.id).toBe(MCP_SERVER_NAME);
    expect(cap.defaultEnabled).toBe(true);
    expect(cap.label).toBeTruthy();
    expect(cap.description).toBeTruthy();
  });

  it('builds the expected stdio entry with full env', async () => {
    const internal = {
      getPath: jest.fn().mockReturnValue('/path/to/index.cjs'),
    } as unknown as McpInternalService;
    const cap = createOmniscribeCapability(internal);

    const entry = await cap.buildConfig(makeCtx());

    expect(entry).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['/path/to/index.cjs'],
      env: {
        OMNISCRIBE_SESSION_ID: 'session-1',
        OMNISCRIBE_PROJECT_HASH: 'abcdef012345',
        OMNISCRIBE_STATUS_URL: 'http://127.0.0.1:9900/status',
        OMNISCRIBE_INSTANCE_ID: 'test-instance',
      },
    });
  });

  it('omits OMNISCRIBE_STATUS_URL when statusUrl is null', async () => {
    const internal = {
      getPath: jest.fn().mockReturnValue('/path/to/index.cjs'),
    } as unknown as McpInternalService;
    const cap = createOmniscribeCapability(internal);

    const entry = await cap.buildConfig(makeCtx({ statusUrl: null }));

    expect(entry?.env?.OMNISCRIBE_STATUS_URL).toBeUndefined();
    expect(entry?.env?.OMNISCRIBE_INSTANCE_ID).toBe('test-instance');
  });

  it('omits OMNISCRIBE_INSTANCE_ID when instanceId is null', async () => {
    const internal = {
      getPath: jest.fn().mockReturnValue('/path/to/index.cjs'),
    } as unknown as McpInternalService;
    const cap = createOmniscribeCapability(internal);

    const entry = await cap.buildConfig(makeCtx({ instanceId: null }));

    expect(entry?.env?.OMNISCRIBE_INSTANCE_ID).toBeUndefined();
  });

  it('returns null when internal MCP path is unavailable', async () => {
    const internal = { getPath: jest.fn().mockReturnValue(null) } as unknown as McpInternalService;
    const cap = createOmniscribeCapability(internal);

    const entry = await cap.buildConfig(makeCtx());

    expect(entry).toBeNull();
  });
});
