import { Test, TestingModule } from '@nestjs/testing';
import { MCP_SERVER_NAME, normalizePath } from '@omniscribe/shared';
import { McpCapabilityStateService } from './mcp-capability-state.service';
import { McpCapabilityRegistryService } from './mcp-capability-registry.service';
import { WorkspaceService } from '../../workspace/workspace.service';

describe('McpCapabilityStateService', () => {
  let service: McpCapabilityStateService;
  let workspace: jest.Mocked<WorkspaceService>;
  let registry: jest.Mocked<McpCapabilityRegistryService>;

  beforeEach(async () => {
    workspace = {
      getProjectCapabilities: jest.fn(),
      setProjectCapabilities: jest.fn(),
      getProjectElectronCdpPort: jest.fn(),
      setProjectElectronCdpPort: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    registry = {
      defaultEnabledIds: jest.fn().mockReturnValue([MCP_SERVER_NAME]),
    } as unknown as jest.Mocked<McpCapabilityRegistryService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpCapabilityStateService,
        { provide: WorkspaceService, useValue: workspace },
        { provide: McpCapabilityRegistryService, useValue: registry },
      ],
    }).compile();

    service = module.get(McpCapabilityStateService);
  });

  describe('getEnabled', () => {
    it('falls back to registry defaults when no state is stored', () => {
      workspace.getProjectCapabilities.mockReturnValue(undefined);

      const result = service.getEnabled('/some/project');

      expect(result).toEqual([MCP_SERVER_NAME]);
      expect(registry.defaultEnabledIds).toHaveBeenCalled();
    });

    it('returns stored ids when present (even if empty)', () => {
      workspace.getProjectCapabilities.mockReturnValue([]);
      expect(service.getEnabled('/p')).toEqual([]);

      workspace.getProjectCapabilities.mockReturnValue(['custom']);
      expect(service.getEnabled('/p')).toEqual(['custom']);
    });

    it('normalizes the project path before lookup', () => {
      workspace.getProjectCapabilities.mockReturnValue(['x']);
      service.getEnabled('/Some/Project');

      expect(workspace.getProjectCapabilities).toHaveBeenCalledWith(normalizePath('/Some/Project'));
    });
  });

  describe('setEnabled', () => {
    it('persists to workspace via normalized path', () => {
      service.setEnabled('/proj', ['a', 'b']);
      expect(workspace.setProjectCapabilities).toHaveBeenCalledTimes(1);
      const [pathArg, ids] = workspace.setProjectCapabilities.mock.calls[0];
      expect(pathArg).toBe(normalizePath('/proj'));
      expect(ids).toEqual(['a', 'b']);
    });
  });

  describe('toggle', () => {
    it('adds an id when enabled=true', () => {
      workspace.getProjectCapabilities.mockReturnValue(['existing']);
      const result = service.toggle('/p', 'new', true);
      expect(result).toEqual(expect.arrayContaining(['existing', 'new']));
      expect(workspace.setProjectCapabilities).toHaveBeenCalled();
    });

    it('removes an id when enabled=false', () => {
      workspace.getProjectCapabilities.mockReturnValue(['existing', 'remove-me']);
      const result = service.toggle('/p', 'remove-me', false);
      expect(result).toEqual(['existing']);
    });

    it('falls back to registry defaults if no state is stored', () => {
      workspace.getProjectCapabilities.mockReturnValue(undefined);
      const result = service.toggle('/p', 'extra', true);
      expect(result).toEqual(expect.arrayContaining([MCP_SERVER_NAME, 'extra']));
    });

    it('does nothing visible when removing an id that is not present', () => {
      workspace.getProjectCapabilities.mockReturnValue(['a']);
      const result = service.toggle('/p', 'b', false);
      expect(result).toEqual(['a']);
    });

    it('electron cdp port: defaults to 9222 when unset', () => {
      (workspace.getProjectElectronCdpPort as jest.Mock).mockReturnValue(undefined);
      expect(service.getElectronCdpPort('/p')).toBe(9222);
    });

    it('electron cdp port: returns stored value when set', () => {
      (workspace.getProjectElectronCdpPort as jest.Mock).mockReturnValue(9333);
      expect(service.getElectronCdpPort('/p')).toBe(9333);
    });

    it('electron cdp port: persists via workspace with normalized path', () => {
      service.setElectronCdpPort('/Proj', 9444);
      expect(workspace.setProjectElectronCdpPort).toHaveBeenCalledTimes(1);
      const [key, port] = (workspace.setProjectElectronCdpPort as jest.Mock).mock.calls[0];
      expect(key).toBe(normalizePath('/Proj'));
      expect(port).toBe(9444);
    });

    it('persistence roundtrip via workspace mock', () => {
      const stored: Record<string, string[]> = {};
      workspace.getProjectCapabilities.mockImplementation(p =>
        Object.prototype.hasOwnProperty.call(stored, p) ? stored[p] : undefined
      );
      workspace.setProjectCapabilities.mockImplementation((p, ids) => {
        stored[p] = ids;
      });

      service.setEnabled('/proj', ['a']);
      expect(service.getEnabled('/proj')).toEqual(['a']);

      service.toggle('/proj', 'b', true);
      // Copy before sorting so the test never mutates a store-owned array.
      expect([...service.getEnabled('/proj')].sort()).toEqual(['a', 'b']);
    });
  });
});
