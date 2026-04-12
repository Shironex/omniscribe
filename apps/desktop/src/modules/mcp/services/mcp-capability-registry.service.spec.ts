import { Test, TestingModule } from '@nestjs/testing';
import { MCP_SERVER_NAME } from '@omniscribe/shared';
import { McpCapabilityRegistryService } from './mcp-capability-registry.service';
import { McpInternalService } from './mcp-internal.service';
import { CdpInfoService } from './cdp-info.service';
import type { McpCapability } from '../capabilities/capability.types';

describe('McpCapabilityRegistryService', () => {
  let service: McpCapabilityRegistryService;
  let internal: jest.Mocked<McpInternalService>;
  let cdp: jest.Mocked<CdpInfoService>;

  beforeEach(async () => {
    internal = {
      getPath: jest.fn().mockReturnValue('/path/to/index.cjs'),
    } as unknown as jest.Mocked<McpInternalService>;

    cdp = {
      isEnabled: jest.fn().mockReturnValue(false),
      getPort: jest.fn().mockReturnValue(9222),
      getEndpoint: jest.fn().mockReturnValue('http://127.0.0.1:9222'),
    } as unknown as jest.Mocked<CdpInfoService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpCapabilityRegistryService,
        { provide: McpInternalService, useValue: internal },
        { provide: CdpInfoService, useValue: cdp },
      ],
    }).compile();

    service = module.get(McpCapabilityRegistryService);
  });

  it('auto-registers the omniscribe capability', () => {
    const omniscribe = service.get(MCP_SERVER_NAME);
    expect(omniscribe).toBeDefined();
    expect(omniscribe?.id).toBe(MCP_SERVER_NAME);
  });

  it('lists registered capabilities', () => {
    const list = service.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(c => c.id === MCP_SERVER_NAME)).toBe(true);
  });

  it('returns omniscribe in defaultEnabledIds()', () => {
    expect(service.defaultEnabledIds()).toContain(MCP_SERVER_NAME);
  });

  it('register() adds a new capability', () => {
    const fake: McpCapability = {
      id: 'fake',
      label: 'Fake',
      description: 'fake cap',
      buildConfig: async () => null,
    };
    service.register(fake);
    expect(service.get('fake')).toBe(fake);
    expect(service.list().some(c => c.id === 'fake')).toBe(true);
  });

  it('register() overwrites an existing capability with the same id', () => {
    const fakeA: McpCapability = {
      id: 'dup',
      label: 'A',
      description: '',
      buildConfig: async () => null,
    };
    const fakeB: McpCapability = {
      id: 'dup',
      label: 'B',
      description: '',
      buildConfig: async () => null,
    };
    service.register(fakeA);
    service.register(fakeB);
    expect(service.get('dup')?.label).toBe('B');
  });

  it('defaultEnabledIds() excludes capabilities without defaultEnabled', () => {
    service.register({
      id: 'opt-in',
      label: 'Opt-in',
      description: '',
      buildConfig: async () => null,
    });
    expect(service.defaultEnabledIds()).not.toContain('opt-in');
  });

  it('get() returns undefined for unknown ids', () => {
    expect(service.get('nope')).toBeUndefined();
  });

  it('auto-registers the playwright-web capability', () => {
    const pw = service.get('playwright-web');
    expect(pw).toBeDefined();
    expect(pw?.id).toBe('playwright-web');
    expect(pw?.label).toBe('Playwright (Web)');
  });

  it('playwright-web is opt-in (not in defaultEnabledIds)', () => {
    expect(service.defaultEnabledIds()).not.toContain('playwright-web');
  });

  it('auto-registers the playwright-electron capability with requiresDev', () => {
    const pw = service.get('playwright-electron');
    expect(pw).toBeDefined();
    expect(pw?.label).toBe('Playwright (Electron)');
    expect(pw?.requiresDev).toBe(true);
  });

  it('playwright-electron is opt-in (not in defaultEnabledIds)', () => {
    expect(service.defaultEnabledIds()).not.toContain('playwright-electron');
  });

  it('playwright-electron preflight fails when CDP disabled', async () => {
    cdp.isEnabled.mockReturnValue(false);
    const pw = service.get('playwright-electron');
    const result = await pw?.preflight?.({
      sessionId: '',
      workingDir: '/tmp',
      projectPath: '/tmp',
      projectHash: '',
      statusUrl: null,
      instanceId: null,
    });
    expect(result?.ok).toBe(false);
    expect(result?.reason).toMatch(/CDP not enabled/);
  });

  it('playwright-electron buildConfig uses the CDP endpoint', async () => {
    cdp.isEnabled.mockReturnValue(true);
    const pw = service.get('playwright-electron');
    const cfg = await pw?.buildConfig({
      sessionId: '',
      workingDir: '/tmp',
      projectPath: '/tmp',
      projectHash: '',
      statusUrl: null,
      instanceId: null,
    });
    expect(cfg).toEqual({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--cdp-endpoint', 'http://127.0.0.1:9222'],
    });
  });
});
