import { Test, TestingModule } from '@nestjs/testing';
import { McpProjectCacheService } from './mcp-project-cache.service';
import type { McpServerConfig } from '@omniscribe/shared';

describe('McpProjectCacheService', () => {
  let service: McpProjectCacheService;

  const mockServer1: McpServerConfig = {
    id: 'server1',
    name: 'Server 1',
    transport: 'stdio',
    command: 'node',
    args: ['s1.js'],
    enabled: true,
    autoConnect: false,
  };

  const mockServer2: McpServerConfig = {
    id: 'server2',
    name: 'Server 2',
    transport: 'sse',
    url: 'http://localhost:8080',
    enabled: true,
    autoConnect: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [McpProjectCacheService],
    }).compile();

    service = module.get<McpProjectCacheService>(McpProjectCacheService);
  });

  describe('setServers / getServers', () => {
    it('should store and retrieve servers for a project', () => {
      const servers = [mockServer1, mockServer2];

      service.setServers('/project/path', servers);
      const result = service.getServers('/project/path');

      expect(result).toEqual(servers);
    });

    it('should return empty array for uncached project', () => {
      const result = service.getServers('/unknown/project');

      expect(result).toEqual([]);
    });

    it('should overwrite previous cache for same project', () => {
      service.setServers('/project', [mockServer1]);
      service.setServers('/project', [mockServer2]);

      const result = service.getServers('/project');

      expect(result).toEqual([mockServer2]);
    });

    it('should cache different projects independently', () => {
      service.setServers('/project1', [mockServer1]);
      service.setServers('/project2', [mockServer2]);

      expect(service.getServers('/project1')).toEqual([mockServer1]);
      expect(service.getServers('/project2')).toEqual([mockServer2]);
    });

    it('should store empty array', () => {
      service.setServers('/project', []);

      expect(service.getServers('/project')).toEqual([]);
      expect(service.hasServers('/project')).toBe(true);
    });
  });

  describe('hasServers', () => {
    it('should return true when servers are cached', () => {
      service.setServers('/project', [mockServer1]);

      expect(service.hasServers('/project')).toBe(true);
    });

    it('should return false when no servers are cached', () => {
      expect(service.hasServers('/unknown')).toBe(false);
    });

    it('should return true for empty server list (still cached)', () => {
      service.setServers('/project', []);

      expect(service.hasServers('/project')).toBe(true);
    });
  });

  describe('clearServers', () => {
    it('should remove cached servers for a project', () => {
      service.setServers('/project', [mockServer1]);

      service.clearServers('/project');

      expect(service.hasServers('/project')).toBe(false);
      expect(service.getServers('/project')).toEqual([]);
    });

    it('should not affect other projects', () => {
      service.setServers('/project1', [mockServer1]);
      service.setServers('/project2', [mockServer2]);

      service.clearServers('/project1');

      expect(service.hasServers('/project1')).toBe(false);
      expect(service.hasServers('/project2')).toBe(true);
    });

    it('should be safe to call for uncached project', () => {
      // Should not throw
      service.clearServers('/unknown');

      expect(service.hasServers('/unknown')).toBe(false);
    });
  });

  describe('clearAll', () => {
    it('should remove all cached servers', () => {
      service.setServers('/project1', [mockServer1]);
      service.setServers('/project2', [mockServer2]);

      service.clearAll();

      expect(service.hasServers('/project1')).toBe(false);
      expect(service.hasServers('/project2')).toBe(false);
    });

    it('should be safe to call when cache is already empty', () => {
      // Should not throw
      service.clearAll();

      expect(service.getServers('/anything')).toEqual([]);
    });
  });
});
