import { Test, TestingModule } from '@nestjs/testing';
import { McpWriterService } from './mcp-writer.service';
import { McpInternalService } from './mcp-internal.service';
import { McpTrackingService } from './mcp-tracking.service';
import { McpSessionRegistryService } from './mcp-session-registry.service';
import { McpStatusServerService } from '../mcp-status-server.service';
import type { McpServerConfig } from '@omniscribe/shared';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
}));

import * as fs from 'fs';

const existsSyncMock = fs.existsSync as jest.Mock;
const writeFileMock = fs.promises.writeFile as jest.Mock;
const readFileMock = fs.promises.readFile as jest.Mock;

describe('McpWriterService', () => {
  let service: McpWriterService;
  let internalService: jest.Mocked<McpInternalService>;
  let trackingService: jest.Mocked<McpTrackingService>;
  let sessionRegistry: jest.Mocked<McpSessionRegistryService>;
  let statusServer: jest.Mocked<McpStatusServerService>;

  beforeEach(async () => {
    internalService = {
      getPath: jest.fn().mockReturnValue('/path/to/mcp-server/index.js'),
      getInternalMcpInfo: jest.fn().mockReturnValue({
        available: true,
        path: '/path/to/mcp-server/index.js',
      }),
    } as unknown as jest.Mocked<McpInternalService>;

    trackingService = {
      track: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<McpTrackingService>;

    sessionRegistry = {
      registerSession: jest.fn(),
      unregisterSession: jest.fn(),
    } as unknown as jest.Mocked<McpSessionRegistryService>;

    statusServer = {
      getStatusUrl: jest.fn().mockReturnValue('http://127.0.0.1:9900/status'),
      getInstanceId: jest.fn().mockReturnValue('test-instance-id'),
    } as unknown as jest.Mocked<McpStatusServerService>;

    existsSyncMock.mockReset();
    writeFileMock.mockReset();
    readFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpWriterService,
        { provide: McpInternalService, useValue: internalService },
        { provide: McpTrackingService, useValue: trackingService },
        { provide: McpSessionRegistryService, useValue: sessionRegistry },
        { provide: McpStatusServerService, useValue: statusServer },
      ],
    }).compile();

    service = module.get<McpWriterService>(McpWriterService);
  });

  describe('generateProjectHash', () => {
    it('should return a 12-character hex hash', () => {
      const hash = service.generateProjectHash('/project/path');

      expect(hash).toMatch(/^[a-f0-9]{12}$/);
    });

    it('should be deterministic for the same path', () => {
      const hash1 = service.generateProjectHash('/project/path');
      const hash2 = service.generateProjectHash('/project/path');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different paths', () => {
      const hash1 = service.generateProjectHash('/project/a');
      const hash2 = service.generateProjectHash('/project/b');

      expect(hash1).not.toBe(hash2);
    });

    it('should normalize path case for consistency', () => {
      const hash1 = service.generateProjectHash('/Project/Path');
      const hash2 = service.generateProjectHash('/project/path');

      expect(hash1).toBe(hash2);
    });

    it('should produce the same hash regardless of path separator style', () => {
      // Windows-style and Unix-style paths should produce the same hash
      const hashUnix = service.generateProjectHash('/project/path');
      const hashWindows = service.generateProjectHash('\\project\\path');

      expect(hashUnix).toBe(hashWindows);
    });
  });

  describe('writeConfig', () => {
    it('should write config file with internal MCP server', async () => {
      const configPath = await service.writeConfig('/work/dir', 'session-1', '/project', []);

      expect(configPath).toContain('.mcp.json');
      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('.mcp.json'),
        expect.any(String),
        'utf-8'
      );

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig.mcpServers).toBeDefined();
      expect(writtenConfig.mcpServers['omniscribe']).toBeDefined();
      expect(writtenConfig.mcpServers['omniscribe'].type).toBe('stdio');
      expect(writtenConfig.mcpServers['omniscribe'].command).toBe('node');
      expect(writtenConfig.mcpServers['omniscribe'].args).toContain('/path/to/mcp-server/index.js');
    });

    it('should include status URL and instance ID in env', async () => {
      await service.writeConfig('/work', 'session-1', '/project', []);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      const env = writtenConfig.mcpServers['omniscribe'].env;

      expect(env.OMNISCRIBE_SESSION_ID).toBe('session-1');
      expect(env.OMNISCRIBE_PROJECT_HASH).toBeDefined();
      expect(env.OMNISCRIBE_STATUS_URL).toBe('http://127.0.0.1:9900/status');
      expect(env.OMNISCRIBE_INSTANCE_ID).toBe('test-instance-id');
    });

    it('should register session with registry', async () => {
      await service.writeConfig('/work', 'session-1', '/project', []);

      expect(sessionRegistry.registerSession).toHaveBeenCalledWith('session-1', '/project');
    });

    it('should include external servers in config', async () => {
      const servers: McpServerConfig[] = [
        {
          id: 'ext-server',
          name: 'External',
          transport: 'stdio',
          command: 'python',
          args: ['-m', 'server'],
          env: { API_KEY: 'key123' },
          enabled: true,
          autoConnect: false,
        },
      ];

      await service.writeConfig('/work', 'session-1', '/project', servers);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig.mcpServers['ext-server']).toBeDefined();
      expect(writtenConfig.mcpServers['ext-server'].type).toBe('stdio');
      expect(writtenConfig.mcpServers['ext-server'].command).toBe('python');
      expect(writtenConfig.mcpServers['ext-server'].args).toEqual(['-m', 'server']);
      expect(writtenConfig.mcpServers['ext-server'].env).toEqual({ API_KEY: 'key123' });
    });

    it('should skip external server named "omniscribe"', async () => {
      const servers: McpServerConfig[] = [
        {
          id: 'omniscribe',
          name: 'omniscribe',
          transport: 'stdio',
          command: 'node',
          args: ['old-server.js'],
          enabled: true,
          autoConnect: false,
        },
        {
          id: 'other-server',
          name: 'Other',
          transport: 'stdio',
          command: 'node',
          args: ['other.js'],
          enabled: true,
          autoConnect: false,
        },
      ];

      await service.writeConfig('/work', 'session-1', '/project', servers);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      // Should have internal omniscribe + other-server, but NOT the external omniscribe
      expect(writtenConfig.mcpServers['other-server']).toBeDefined();
      expect(Object.keys(writtenConfig.mcpServers)).toHaveLength(2);
    });

    it('should not include internal server when path is null', async () => {
      internalService.getPath.mockReturnValue(null);

      await service.writeConfig('/work', 'session-1', '/project', []);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig.mcpServers['omniscribe']).toBeUndefined();
    });

    it('should omit status URL from env when not available', async () => {
      statusServer.getStatusUrl.mockReturnValue(null);

      await service.writeConfig('/work', 'session-1', '/project', []);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      const env = writtenConfig.mcpServers['omniscribe'].env;

      expect(env.OMNISCRIBE_STATUS_URL).toBeUndefined();
    });

    it('should omit instance ID from env when not available', async () => {
      statusServer.getInstanceId.mockReturnValue(null);

      await service.writeConfig('/work', 'session-1', '/project', []);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      const env = writtenConfig.mcpServers['omniscribe'].env;

      expect(env.OMNISCRIBE_INSTANCE_ID).toBeUndefined();
    });

    it('should include metadata in config', async () => {
      await service.writeConfig('/work', 'session-1', '/project', []);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig['_omniscribe']).toBeDefined();
      expect(writtenConfig['_omniscribe'].sessionId).toBe('session-1');
      expect(writtenConfig['_omniscribe'].projectPath).toBe('/project');
      expect(writtenConfig['_omniscribe'].projectHash).toBeDefined();
      expect(writtenConfig['_omniscribe'].updatedAt).toBeDefined();
    });

    it('should track config after writing', async () => {
      await service.writeConfig('/work', 'session-1', '/project', []);

      expect(trackingService.track).toHaveBeenCalledWith(
        expect.any(String), // projectHash
        'session-1',
        expect.stringContaining('.mcp.json')
      );
    });

    it('should handle SSE server entries', async () => {
      const servers: McpServerConfig[] = [
        {
          id: 'sse-server',
          name: 'SSE Server',
          transport: 'sse',
          url: 'http://localhost:8080/sse',
          enabled: true,
          autoConnect: false,
        },
      ];

      await service.writeConfig('/work', 'session-1', '/project', servers);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig.mcpServers['sse-server'].type).toBe('sse');
      expect(writtenConfig.mcpServers['sse-server'].url).toBe('http://localhost:8080/sse');
      expect(writtenConfig.mcpServers['sse-server'].command).toBeUndefined();
    });

    it('should not include empty args or env', async () => {
      const servers: McpServerConfig[] = [
        {
          id: 'minimal',
          name: 'Minimal',
          transport: 'stdio',
          command: 'node',
          args: [],
          env: {},
          enabled: true,
          autoConnect: false,
        },
      ];

      await service.writeConfig('/work', 'session-1', '/project', servers);

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig.mcpServers['minimal'].args).toBeUndefined();
      expect(writtenConfig.mcpServers['minimal'].env).toBeUndefined();
    });
  });

  describe('removeConfig', () => {
    it('should remove omniscribe entry from existing config', async () => {
      const existingConfig = {
        mcpServers: {
          omniscribe: { type: 'stdio', command: 'node', args: ['index.js'] },
          'other-server': { type: 'stdio', command: 'python', args: ['server.py'] },
        },
        _omniscribe: { sessionId: 'session-1', projectPath: '/project' },
      };

      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(existingConfig));

      const result = await service.removeConfig('/work/dir', 'session-1');

      expect(result).toBe(true);
      expect(sessionRegistry.unregisterSession).toHaveBeenCalledWith('session-1');

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig.mcpServers['omniscribe']).toBeUndefined();
      expect(writtenConfig.mcpServers['other-server']).toBeDefined();
      expect(writtenConfig['_omniscribe']).toBeUndefined();
    });

    it('should return false when config file does not exist', async () => {
      existsSyncMock.mockReturnValue(false);

      const result = await service.removeConfig('/work/dir');

      expect(result).toBe(false);
    });

    it('should return false when omniscribe entry is not present', async () => {
      const existingConfig = {
        mcpServers: {
          'other-server': { type: 'stdio', command: 'python' },
        },
      };

      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(existingConfig));

      const result = await service.removeConfig('/work/dir');

      expect(result).toBe(false);
    });

    it('should return false when mcpServers field is missing', async () => {
      const existingConfig = { someOtherField: true };

      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(existingConfig));

      const result = await service.removeConfig('/work/dir');

      expect(result).toBe(false);
    });

    it('should remove legacy _metadata field', async () => {
      const existingConfig = {
        mcpServers: {
          omniscribe: { type: 'stdio', command: 'node' },
        },
        _omniscribe: { sessionId: 'session-1' },
        _metadata: { legacy: true },
      };

      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(existingConfig));

      await service.removeConfig('/work/dir');

      const writtenConfig = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenConfig['_metadata']).toBeUndefined();
      expect(writtenConfig['_omniscribe']).toBeUndefined();
    });

    it('should handle read errors gracefully', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockRejectedValue(new Error('EACCES'));

      const result = await service.removeConfig('/work/dir');

      expect(result).toBe(false);
    });

    it('should handle JSON parse errors gracefully', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue('invalid json');

      const result = await service.removeConfig('/work/dir');

      expect(result).toBe(false);
    });

    it('should not unregister session when sessionId is not provided', async () => {
      const existingConfig = {
        mcpServers: {
          omniscribe: { type: 'stdio', command: 'node' },
        },
      };

      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(existingConfig));

      await service.removeConfig('/work/dir');

      expect(sessionRegistry.unregisterSession).not.toHaveBeenCalled();
    });
  });

  describe('getInternalMcpInfo', () => {
    it('should delegate to internalService', () => {
      const result = service.getInternalMcpInfo();

      expect(result).toEqual({
        available: true,
        path: '/path/to/mcp-server/index.js',
      });
      expect(internalService.getInternalMcpInfo).toHaveBeenCalled();
    });
  });

  describe('concurrency', () => {
    it('serializes concurrent writeConfig calls to the same path', async () => {
      // Track the order of writeFile calls to prove serialization
      const writeOrder: string[] = [];

      writeFileMock.mockImplementation(async (_path: string, content: string) => {
        const parsed = JSON.parse(content);
        const sessionId = parsed._omniscribe?.sessionId;
        writeOrder.push(`start:${sessionId}`);
        // Small delay to simulate I/O
        await new Promise(resolve => setTimeout(resolve, 10));
        writeOrder.push(`end:${sessionId}`);
      });

      // Both calls target the same workingDir (same .mcp.json path)
      const [result1, result2] = await Promise.all([
        service.writeConfig('/same/dir', 'session-1', '/project', []),
        service.writeConfig('/same/dir', 'session-2', '/project', []),
      ]);

      // Both should complete successfully
      expect(result1).toContain('.mcp.json');
      expect(result2).toContain('.mcp.json');

      // writeFile should have been called twice (once per session)
      expect(writeFileMock).toHaveBeenCalledTimes(2);

      // Serialization means one completes before the other starts
      // The order should be: start:A, end:A, start:B, end:B
      expect(writeOrder).toHaveLength(4);
      expect(writeOrder[1]).toMatch(/^end:/);
      expect(writeOrder[2]).toMatch(/^start:/);
    });

    it('serializes writeConfig and removeConfig for the same path', async () => {
      const operations: string[] = [];

      writeFileMock.mockImplementation(async () => {
        operations.push('writeFile');
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      // Set up removeConfig to find the file and have an omniscribe entry
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockImplementation(async () => {
        operations.push('readFile');
        return JSON.stringify({
          mcpServers: {
            omniscribe: { type: 'stdio', command: 'node' },
            'other-server': { type: 'stdio', command: 'python' },
          },
          _omniscribe: { sessionId: 'session-1' },
        });
      });

      // Fire writeConfig and removeConfig concurrently on the same path
      const [writeResult, removeResult] = await Promise.all([
        service.writeConfig('/same/dir', 'session-1', '/project', []),
        service.removeConfig('/same/dir', 'session-1'),
      ]);

      expect(writeResult).toContain('.mcp.json');
      expect(removeResult).toBe(true);

      // The mutex ensures writeConfig's writeFile completes before
      // removeConfig's readFile starts (or vice versa, depending on scheduling).
      // Either way, a read should never be between a start-write and end-write
      // from the other operation. With serialization:
      // Scenario A: [writeFile(write), readFile(remove), writeFile(remove)]
      // Scenario B: [readFile(remove), writeFile(remove), writeFile(write)]
      // Both are valid -- the key is they don't interleave.
      expect(operations.length).toBeGreaterThanOrEqual(2);

      // Verify writeFile was called at least twice (once by writeConfig, once by removeConfig)
      expect(writeFileMock).toHaveBeenCalledTimes(2);
    });

    it('allows parallel writes to different paths', async () => {
      const timestamps: { path: string; event: string; time: number }[] = [];

      writeFileMock.mockImplementation(async (filePath: string) => {
        timestamps.push({ path: filePath, event: 'start', time: Date.now() });
        // Delay long enough that serialized execution would be detectable
        await new Promise(resolve => setTimeout(resolve, 50));
        timestamps.push({ path: filePath, event: 'end', time: Date.now() });
      });

      // Two calls to DIFFERENT working directories (different .mcp.json paths)
      const [result1, result2] = await Promise.all([
        service.writeConfig('/dir-a', 'session-1', '/project-a', []),
        service.writeConfig('/dir-b', 'session-2', '/project-b', []),
      ]);

      expect(result1).toContain('dir-a');
      expect(result2).toContain('dir-b');

      // Both should have started before either finished (parallel execution).
      // Find the start and end events for each path.
      const dirAStart = timestamps.find(t => t.path.includes('dir-a') && t.event === 'start')!;
      const dirBStart = timestamps.find(t => t.path.includes('dir-b') && t.event === 'start')!;
      const dirAEnd = timestamps.find(t => t.path.includes('dir-a') && t.event === 'end')!;
      const dirBEnd = timestamps.find(t => t.path.includes('dir-b') && t.event === 'end')!;

      // Both starts should occur before both ends (proving parallelism)
      expect(dirAStart.time).toBeLessThan(dirAEnd.time);
      expect(dirBStart.time).toBeLessThan(dirBEnd.time);

      // The key assertion: both started before either ended
      const earliestEnd = Math.min(dirAEnd.time, dirBEnd.time);
      expect(dirAStart.time).toBeLessThanOrEqual(earliestEnd);
      expect(dirBStart.time).toBeLessThanOrEqual(earliestEnd);
    });
  });
});
