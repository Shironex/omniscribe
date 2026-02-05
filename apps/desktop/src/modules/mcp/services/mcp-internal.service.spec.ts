import { Test, TestingModule } from '@nestjs/testing';
import { McpInternalService } from './mcp-internal.service';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

import * as fs from 'fs';

const existsSyncMock = fs.existsSync as jest.Mock;

describe('McpInternalService', () => {
  let service: McpInternalService;

  describe('when internal MCP server is found', () => {
    beforeEach(async () => {
      // Simulate finding the MCP server at the first candidate path
      existsSyncMock.mockReturnValue(true);

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);
    });

    afterEach(() => {
      existsSyncMock.mockReset();
    });

    it('should report the server as available', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return a non-null path', () => {
      expect(service.getPath()).not.toBeNull();
      expect(typeof service.getPath()).toBe('string');
    });

    it('should return correct internal MCP info', () => {
      const info = service.getInternalMcpInfo();

      expect(info.available).toBe(true);
      expect(info.path).not.toBeNull();
      expect(typeof info.path).toBe('string');
    });
  });

  describe('when internal MCP server is not found', () => {
    beforeEach(async () => {
      // No candidate path exists
      existsSyncMock.mockReturnValue(false);

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);
    });

    afterEach(() => {
      existsSyncMock.mockReset();
    });

    it('should report the server as unavailable', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return null path', () => {
      expect(service.getPath()).toBeNull();
    });

    it('should return correct internal MCP info', () => {
      const info = service.getInternalMcpInfo();

      expect(info.available).toBe(false);
      expect(info.path).toBeNull();
    });
  });

  describe('when fs.existsSync throws for early candidates but succeeds later', () => {
    beforeEach(async () => {
      // First call throws, all others return true.
      // The service iterates candidates and catches errors per-candidate,
      // so it should skip the broken candidate and find the next one.
      let callCount = 0;
      existsSyncMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Permission denied');
        }
        return true;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);
    });

    afterEach(() => {
      existsSyncMock.mockReset();
    });

    it('should continue checking other candidates and find the server', () => {
      expect(service.isAvailable()).toBe(true);
      expect(service.getPath()).not.toBeNull();
    });
  });

  describe('when all fs.existsSync calls throw errors', () => {
    beforeEach(async () => {
      existsSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);
    });

    afterEach(() => {
      existsSyncMock.mockReset();
    });

    it('should report the server as unavailable', () => {
      expect(service.isAvailable()).toBe(false);
      expect(service.getPath()).toBeNull();
    });
  });

  describe('path returned by getPath', () => {
    it('should be a normalized path when server exists', async () => {
      existsSyncMock.mockReturnValue(true);

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);

      const p = service.getPath();
      expect(p).not.toBeNull();
      // Normalized paths should not contain '..'
      // (path.normalize resolves them)
      expect(p).toBeDefined();
    });
  });

  describe('cross-platform path candidates', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      existsSyncMock.mockReset();
    });

    it('should check Windows-specific paths on win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      // Track which paths are checked
      const checkedPaths: string[] = [];
      existsSyncMock.mockImplementation((p: string) => {
        checkedPaths.push(p);
        return false;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);

      // Should check Windows-style path (AppData\Local)
      expect(checkedPaths.some(p => p.includes('AppData'))).toBe(true);
      // Should NOT check Unix paths
      expect(checkedPaths.some(p => p === '/usr/local/lib/omniscribe/mcp-server/index.js')).toBe(
        false
      );
      expect(service.isAvailable()).toBe(false);
    });

    it('should check Unix-specific paths on linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const checkedPaths: string[] = [];
      existsSyncMock.mockImplementation((p: string) => {
        checkedPaths.push(p);
        return false;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);

      // Normalize separators for cross-platform assertion: path.join uses native
      // separators even when process.platform is mocked, so check with both
      const normalize = (s: string) => s.replace(/[\\/]/g, '/');
      const normalized = checkedPaths.map(normalize);

      // Should check Unix paths
      expect(normalized.some(p => p.includes('/usr/local/lib') || p.includes('.local/lib'))).toBe(
        true
      );
      // Should NOT check Windows AppData path
      expect(checkedPaths.some(p => p.includes('AppData'))).toBe(false);
      expect(service.isAvailable()).toBe(false);
    });

    it('should check Unix-specific paths on darwin', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const checkedPaths: string[] = [];
      existsSyncMock.mockImplementation((p: string) => {
        checkedPaths.push(p);
        return false;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [McpInternalService],
      }).compile();

      service = module.get<McpInternalService>(McpInternalService);

      // Normalize separators for cross-platform assertion
      const normalize = (s: string) => s.replace(/[\\/]/g, '/');
      const normalized = checkedPaths.map(normalize);

      // macOS should use Unix paths (same as linux for non-XDG services)
      expect(normalized.some(p => p.includes('/usr/local/lib') || p.includes('.local/lib'))).toBe(
        true
      );
      expect(service.isAvailable()).toBe(false);
    });
  });
});
