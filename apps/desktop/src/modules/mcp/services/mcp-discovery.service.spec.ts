import { Test, TestingModule } from '@nestjs/testing';
import { McpDiscoveryService } from './mcp-discovery.service';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

import * as fs from 'fs';

const existsSyncMock = fs.existsSync as jest.Mock;
const readFileMock = fs.promises.readFile as jest.Mock;

describe('McpDiscoveryService', () => {
  let service: McpDiscoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [McpDiscoveryService],
    }).compile();

    service = module.get<McpDiscoveryService>(McpDiscoveryService);

    existsSyncMock.mockReset();
    readFileMock.mockReset();
  });

  describe('discoverServers', () => {
    it('should return empty array when no config files exist', async () => {
      existsSyncMock.mockReturnValue(false);

      const servers = await service.discoverServers('/project');

      expect(servers).toEqual([]);
    });

    it('should discover servers from .mcp.json', async () => {
      const config = {
        mcpServers: {
          'my-server': {
            command: 'node',
            args: ['server.js'],
            env: { PORT: '3000' },
          },
        },
      };

      existsSyncMock.mockImplementation((p: string) => p.endsWith('.mcp.json'));
      readFileMock.mockResolvedValue(JSON.stringify(config));

      const servers = await service.discoverServers('/project');

      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual(
        expect.objectContaining({
          id: 'my-server',
          name: 'my-server',
          transport: 'stdio',
          command: 'node',
          args: ['server.js'],
          env: { PORT: '3000' },
          enabled: true,
          autoConnect: false,
        })
      );
    });

    it('should discover servers from multiple config files', async () => {
      const config1 = {
        mcpServers: {
          server1: { command: 'node', args: ['s1.js'] },
        },
      };
      const config2 = {
        mcpServers: {
          server2: { command: 'node', args: ['s2.js'] },
        },
      };

      // .mcp.json and mcp.json both exist
      existsSyncMock.mockImplementation(
        (p: string) => p.endsWith('.mcp.json') || (p.endsWith('mcp.json') && !p.includes('.'))
      );

      // Return different configs for different file reads
      let callCount = 0;
      readFileMock.mockImplementation(() => {
        callCount++;
        return Promise.resolve(JSON.stringify(callCount === 1 ? config1 : config2));
      });

      // Both .mcp.json and mcp.json exist
      existsSyncMock.mockReturnValue(true);

      const servers = await service.discoverServers('/project');

      expect(servers.length).toBeGreaterThanOrEqual(1);
    });

    it('should deduplicate servers by ID', async () => {
      const config = {
        mcpServers: {
          'my-server': { command: 'node', args: ['server.js'] },
        },
      };

      // All three config files exist with the same server
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(config));

      const servers = await service.discoverServers('/project');

      // Should have only one entry for 'my-server'
      const myServerCount = servers.filter(s => s.id === 'my-server').length;
      expect(myServerCount).toBe(1);
    });

    it('should handle JSON parse errors gracefully', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue('not valid json {{{');

      const servers = await service.discoverServers('/project');

      expect(servers).toEqual([]);
    });

    it('should handle file read errors gracefully', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockRejectedValue(new Error('EACCES: permission denied'));

      const servers = await service.discoverServers('/project');

      expect(servers).toEqual([]);
    });

    it('should return empty array for invalid projectPath', async () => {
      const result1 = await service.discoverServers('');
      const result2 = await service.discoverServers(null as unknown as string);
      const result3 = await service.discoverServers(undefined as unknown as string);

      expect(result1).toEqual([]);
      expect(result2).toEqual([]);
      expect(result3).toEqual([]);
    });

    it('should discover SSE server from URL', async () => {
      const config = {
        mcpServers: {
          'sse-server': {
            url: 'http://localhost:8080/sse',
          },
        },
      };

      existsSyncMock.mockImplementation((p: string) => p.endsWith('.mcp.json'));
      readFileMock.mockResolvedValue(JSON.stringify(config));

      const servers = await service.discoverServers('/project');

      expect(servers).toHaveLength(1);
      expect(servers[0].transport).toBe('sse');
      expect(servers[0].url).toBe('http://localhost:8080/sse');
    });

    it('should discover WebSocket server from URL', async () => {
      const config = {
        mcpServers: {
          'ws-server': {
            url: 'ws://localhost:9090/ws',
          },
        },
      };

      existsSyncMock.mockImplementation((p: string) => p.endsWith('.mcp.json'));
      readFileMock.mockResolvedValue(JSON.stringify(config));

      const servers = await service.discoverServers('/project');

      expect(servers).toHaveLength(1);
      expect(servers[0].transport).toBe('websocket');
    });
  });

  describe('parseConfig', () => {
    it('should return empty array when mcpServers is missing', () => {
      const result = service.parseConfig({});

      expect(result).toEqual([]);
    });

    it('should parse stdio server with all fields', () => {
      const config = {
        mcpServers: {
          'test-server': {
            command: 'npx',
            args: ['-y', 'test-server'],
            env: { API_KEY: '123' },
            enabled: false,
            autoConnect: true,
            timeout: 5000,
            description: 'A test server',
            retry: { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 },
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(1);
      expect(servers[0]).toEqual({
        id: 'test-server',
        name: 'test-server',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'test-server'],
        env: { API_KEY: '123' },
        enabled: false,
        autoConnect: true,
        timeout: 5000,
        description: 'A test server',
        retry: { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2 },
        url: undefined,
      });
    });

    it('should use explicit transport over inferred', () => {
      const config = {
        mcpServers: {
          'explicit-transport': {
            transport: 'sse' as const,
            url: 'ws://localhost:8080',
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(1);
      expect(servers[0].transport).toBe('sse');
    });

    it('should skip stdio server without command', () => {
      const config = {
        mcpServers: {
          'no-command': {
            args: ['--help'],
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(0);
    });

    it('should skip SSE server without URL', () => {
      const config = {
        mcpServers: {
          'no-url': {
            transport: 'sse' as const,
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(0);
    });

    it('should skip WebSocket server without URL', () => {
      const config = {
        mcpServers: {
          'no-url-ws': {
            transport: 'websocket' as const,
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(0);
    });

    it('should infer SSE transport from https URL', () => {
      const config = {
        mcpServers: {
          'https-server': {
            url: 'https://api.example.com/mcp',
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(1);
      expect(servers[0].transport).toBe('sse');
    });

    it('should infer WebSocket transport from wss URL', () => {
      const config = {
        mcpServers: {
          'wss-server': {
            url: 'wss://api.example.com/ws',
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(1);
      expect(servers[0].transport).toBe('websocket');
    });

    it('should default enabled to true and autoConnect to false', () => {
      const config = {
        mcpServers: {
          server: {
            command: 'node',
            args: ['index.js'],
          },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers[0].enabled).toBe(true);
      expect(servers[0].autoConnect).toBe(false);
    });

    it('should parse multiple servers', () => {
      const config = {
        mcpServers: {
          server1: { command: 'node', args: ['s1.js'] },
          server2: { command: 'python', args: ['s2.py'] },
          server3: { url: 'http://localhost:3000' },
        },
      };

      const servers = service.parseConfig(config);

      expect(servers).toHaveLength(3);
      expect(servers.map(s => s.id)).toEqual(['server1', 'server2', 'server3']);
    });
  });

  describe('validateConfig', () => {
    it('should return true for valid stdio config', () => {
      const config = {
        id: 'test',
        name: 'test',
        transport: 'stdio' as const,
        command: 'node',
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(true);
    });

    it('should return true for valid SSE config', () => {
      const config = {
        id: 'test',
        name: 'test',
        transport: 'sse' as const,
        url: 'http://localhost:8080',
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(true);
    });

    it('should return true for valid WebSocket config', () => {
      const config = {
        id: 'test',
        name: 'test',
        transport: 'websocket' as const,
        url: 'ws://localhost:8080',
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(true);
    });

    it('should return false when id is missing', () => {
      const config = {
        id: '',
        name: 'test',
        transport: 'stdio' as const,
        command: 'node',
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(false);
    });

    it('should return false when name is missing', () => {
      const config = {
        id: 'test',
        name: '',
        transport: 'stdio' as const,
        command: 'node',
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(false);
    });

    it('should return false for stdio without command', () => {
      const config = {
        id: 'test',
        name: 'test',
        transport: 'stdio' as const,
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(false);
    });

    it('should return false for SSE without url', () => {
      const config = {
        id: 'test',
        name: 'test',
        transport: 'sse' as const,
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(false);
    });

    it('should return false for websocket without url', () => {
      const config = {
        id: 'test',
        name: 'test',
        transport: 'websocket' as const,
        enabled: true,
        autoConnect: false,
      };

      expect(service.validateConfig(config)).toBe(false);
    });
  });
});
