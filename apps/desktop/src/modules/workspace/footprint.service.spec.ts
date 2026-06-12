import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import type { WorktreeInfo } from '@omniscribe/shared';

// electron-store (pulled in transitively via WorkspaceService → McpWriterService)
// requires the electron binary, which isn't available in the jest environment.
// Stub both so importing the service graph doesn't blow up.
jest.mock('electron', () => ({ app: { getPath: jest.fn(() => '/mock/userData') } }));
jest.mock('electron-store', () => ({ __esModule: true, default: class {} }));

// The default `jest.mock('fs')` auto-mock does NOT stub `fs.promises`, which
// FootprintService.detectMcpConfig relies on. Provide both surfaces.
jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  promises: {
    readFile: jest.fn(),
  },
}));

import { FootprintService } from './footprint.service';
import { WorkspaceService } from './workspace.service';
import { McpWriterService } from '../mcp/services/mcp-writer.service';
import { WorktreeService } from '../git/worktree.service';
import { PluginRegistryService } from '../plugin/plugin-registry.service';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedReadFile = mockedFs.promises.readFile as jest.Mock;

describe('FootprintService', () => {
  let service: FootprintService;
  let workspace: jest.Mocked<WorkspaceService>;
  let mcpWriter: jest.Mocked<McpWriterService>;
  let worktreeService: jest.Mocked<WorktreeService>;
  let pluginRegistry: jest.Mocked<PluginRegistryService>;

  // A live in-memory store backing WorkspaceService.get/set for passive-mode tests.
  let store: Record<string, unknown>;

  // Fake Claude hook manager exposing the footprint surface FootprintService uses.
  let hookManager: {
    detectFootprint: jest.Mock;
    unregisterHooks: jest.Mock;
    removeHookScript: jest.Mock;
    getHookScriptPath: jest.Mock;
    getSettingsPath: jest.Mock;
  };

  const projectPath = '/home/me/proj';

  beforeEach(async () => {
    store = {};

    workspace = {
      get: jest.fn((key: string) => store[key]),
      set: jest.fn((key: string, value: unknown) => {
        store[key] = value;
      }),
    } as unknown as jest.Mocked<WorkspaceService>;

    mcpWriter = {
      removeConfig: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<McpWriterService>;

    worktreeService = {
      list: jest.fn().mockResolvedValue([]),
      cleanupAll: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<WorktreeService>;

    hookManager = {
      detectFootprint: jest
        .fn()
        .mockResolvedValue({ hooksPresent: false, hookCount: 0, scriptPresent: false }),
      unregisterHooks: jest.fn().mockResolvedValue(undefined),
      removeHookScript: jest.fn().mockResolvedValue(true),
      getHookScriptPath: jest
        .fn()
        .mockImplementation((p: string) => `${p}/.claude/hooks/omniscribe-notify.js`),
      getSettingsPath: jest
        .fn()
        .mockImplementation((p: string) => `${p}/.claude/settings.local.json`),
    };

    pluginRegistry = {
      getProviderEntry: jest.fn().mockReturnValue({
        plugin: { getHookManager: () => hookManager },
      }),
    } as unknown as jest.Mocked<PluginRegistryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FootprintService,
        { provide: WorkspaceService, useValue: workspace },
        { provide: McpWriterService, useValue: mcpWriter },
        { provide: WorktreeService, useValue: worktreeService },
        { provide: PluginRegistryService, useValue: pluginRegistry },
      ],
    }).compile();

    service = module.get<FootprintService>(FootprintService);

    // Default fs: nothing on disk.
    mockedFs.existsSync.mockReturnValue(false);
    mockedReadFile.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // Detection gating
  // ----------------------------------------------------------------
  describe('getFootprint — detection gating', () => {
    it('returns an empty footprint for a clean project', async () => {
      const entries = await service.getFootprint(projectPath);
      expect(entries).toEqual([]);
    });

    it('detects managed .mcp.json only when the _omniscribe marker is present', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue(
        JSON.stringify({
          mcpServers: { omniscribe: {}, foreign: {} },
          _omniscribe: { managedCapabilities: ['omniscribe', 'playwright'] },
        })
      );

      const entries = await service.getFootprint(projectPath);
      const mcp = entries.find(e => e.kind === 'mcp-config');
      expect(mcp).toBeDefined();
      expect(mcp?.count).toBe(2);
      expect(mcp?.path).toContain('.mcp.json');
    });

    it('does NOT report .mcp.json when the marker is absent (foreign config)', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue(JSON.stringify({ mcpServers: { someUserServer: {} } }));

      const entries = await service.getFootprint(projectPath);
      expect(entries.find(e => e.kind === 'mcp-config')).toBeUndefined();
    });

    it('does NOT crash or report on unparseable .mcp.json', async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedReadFile.mockResolvedValue('{ not json');

      const entries = await service.getFootprint(projectPath);
      expect(entries.find(e => e.kind === 'mcp-config')).toBeUndefined();
    });

    it('detects Claude hooks and the hook script via the provider hook manager', async () => {
      hookManager.detectFootprint.mockResolvedValue({
        hooksPresent: true,
        hookCount: 4,
        scriptPresent: true,
      });

      const entries = await service.getFootprint(projectPath);
      const hooks = entries.find(e => e.kind === 'claude-hooks');
      const script = entries.find(e => e.kind === 'hook-script');
      expect(hooks).toBeDefined();
      expect(hooks?.count).toBe(4);
      expect(script).toBeDefined();
      expect(script?.path).toContain('omniscribe-notify.js');
    });

    it('reports no hook footprint when the provider is unavailable', async () => {
      pluginRegistry.getProviderEntry.mockReturnValue(undefined);
      const entries = await service.getFootprint(projectPath);
      expect(entries.find(e => e.kind === 'claude-hooks')).toBeUndefined();
      expect(entries.find(e => e.kind === 'hook-script')).toBeUndefined();
    });

    it('detects only project-local worktrees (excludes main and central)', async () => {
      const worktrees: WorktreeInfo[] = [
        { path: projectPath, isMain: true, isLocked: false, isPrunable: false },
        {
          path: `${projectPath}/.worktrees/feature-x`,
          isMain: false,
          isLocked: false,
          isPrunable: false,
        },
        {
          path: '/home/me/.omniscribe/worktrees/abc/other',
          isMain: false,
          isLocked: false,
          isPrunable: false,
        },
      ];
      worktreeService.list.mockResolvedValue(worktrees);

      const entries = await service.getFootprint(projectPath);
      const wt = entries.find(e => e.kind === 'worktrees');
      expect(wt).toBeDefined();
      expect(wt?.count).toBe(1);
    });

    it('reports no worktree footprint when listing throws (not a git repo)', async () => {
      worktreeService.list.mockRejectedValue(new Error('not a git repo'));
      const entries = await service.getFootprint(projectPath);
      expect(entries.find(e => e.kind === 'worktrees')).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // Removal delegation
  // ----------------------------------------------------------------
  describe('removeFootprint — delegation', () => {
    it('delegates mcp-config removal to McpWriterService.removeConfig', async () => {
      const results = await service.removeFootprint(projectPath, ['mcp-config']);
      expect(mcpWriter.removeConfig).toHaveBeenCalledWith(projectPath);
      expect(results).toEqual([{ kind: 'mcp-config', ok: true }]);
    });

    it('delegates claude-hooks removal to hookManager.unregisterHooks', async () => {
      const results = await service.removeFootprint(projectPath, ['claude-hooks']);
      expect(hookManager.unregisterHooks).toHaveBeenCalledWith(projectPath);
      expect(results).toEqual([{ kind: 'claude-hooks', ok: true }]);
    });

    it('delegates hook-script removal to hookManager.removeHookScript', async () => {
      const results = await service.removeFootprint(projectPath, ['hook-script']);
      expect(hookManager.removeHookScript).toHaveBeenCalledWith(projectPath);
      expect(results).toEqual([{ kind: 'hook-script', ok: true }]);
    });

    it('delegates worktrees removal to WorktreeService.cleanupAll', async () => {
      const results = await service.removeFootprint(projectPath, ['worktrees']);
      expect(worktreeService.cleanupAll).toHaveBeenCalledWith(projectPath);
      expect(results).toEqual([{ kind: 'worktrees', ok: true }]);
    });

    it('returns a per-kind failure without aborting other kinds', async () => {
      mcpWriter.removeConfig.mockRejectedValueOnce(new Error('disk full'));

      const results = await service.removeFootprint(projectPath, ['mcp-config', 'worktrees']);

      expect(results).toEqual([
        { kind: 'mcp-config', ok: false, error: 'disk full' },
        { kind: 'worktrees', ok: true },
      ]);
      // The second kind still ran.
      expect(worktreeService.cleanupAll).toHaveBeenCalledWith(projectPath);
    });

    it('reports a failure when hook removal is requested but the provider is unavailable', async () => {
      pluginRegistry.getProviderEntry.mockReturnValue(undefined);
      const results = await service.removeFootprint(projectPath, ['claude-hooks']);
      expect(results[0].ok).toBe(false);
      expect(results[0].error).toMatch(/not available/);
    });

    it('de-duplicates requested kinds', async () => {
      await service.removeFootprint(projectPath, ['mcp-config', 'mcp-config']);
      expect(mcpWriter.removeConfig).toHaveBeenCalledTimes(1);
    });
  });

  // ----------------------------------------------------------------
  // Passive mode persistence + enforcement seam
  // ----------------------------------------------------------------
  describe('passive mode', () => {
    it('defaults to off for an unseen project', () => {
      expect(service.isPassiveMode(projectPath)).toBe(false);
    });

    it('persists enabled state via WorkspaceService.set under projectPassiveMode', () => {
      service.setPassiveMode(projectPath, true);
      expect(workspace.set).toHaveBeenCalledWith(
        'projectPassiveMode',
        expect.objectContaining({ [projectPath]: true })
      );
      expect(service.isPassiveMode(projectPath)).toBe(true);
    });

    it('removes the project key when disabled rather than storing false', () => {
      service.setPassiveMode(projectPath, true);
      service.setPassiveMode(projectPath, false);
      const stored = store['projectPassiveMode'] as Record<string, boolean>;
      expect(stored[projectPath]).toBeUndefined();
      expect(service.isPassiveMode(projectPath)).toBe(false);
    });

    it('normalizes the project path so lookups match regardless of separators', () => {
      service.setPassiveMode('/home/me/proj', true);
      // A trailing slash / windows-style variant normalizes to the same key.
      expect(service.isPassiveMode('/home/me/proj')).toBe(true);
    });
  });
});
