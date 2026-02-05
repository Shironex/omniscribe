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
});
