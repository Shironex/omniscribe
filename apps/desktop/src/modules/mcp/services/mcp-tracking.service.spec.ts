import { Test, TestingModule } from '@nestjs/testing';
import { McpTrackingService } from './mcp-tracking.service';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readdir: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

import * as fs from 'fs';

const existsSyncMock = fs.existsSync as jest.Mock;
const mkdirSyncMock = fs.mkdirSync as jest.Mock;
const mkdirMock = fs.promises.mkdir as jest.Mock;
const writeFileMock = fs.promises.writeFile as jest.Mock;
const readdirMock = fs.promises.readdir as jest.Mock;
const readFileMock = fs.promises.readFile as jest.Mock;
const unlinkMock = fs.promises.unlink as jest.Mock;

describe('McpTrackingService', () => {
  let service: McpTrackingService;

  beforeEach(async () => {
    existsSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    readdirMock.mockReset();
    readFileMock.mockReset();
    unlinkMock.mockReset();

    // Constructor calls ensureConfigDir which checks existsSync
    existsSyncMock.mockReturnValue(false);
    mkdirSyncMock.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [McpTrackingService],
    }).compile();

    service = module.get<McpTrackingService>(McpTrackingService);
  });

  describe('constructor', () => {
    it('should create the config directory if it does not exist', () => {
      // The constructor was called in beforeEach
      expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('mcp-configs'), {
        recursive: true,
      });
    });

    it('should not create the config directory if it already exists', async () => {
      existsSyncMock.mockReturnValue(true);
      mkdirSyncMock.mockReset();

      await Test.createTestingModule({
        providers: [McpTrackingService],
      }).compile();

      expect(mkdirSyncMock).not.toHaveBeenCalled();
    });

    it('should handle errors creating config directory gracefully', async () => {
      existsSyncMock.mockReturnValue(false);
      mkdirSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      // Should not throw
      const module = await Test.createTestingModule({
        providers: [McpTrackingService],
      }).compile();

      const svc = module.get<McpTrackingService>(McpTrackingService);
      expect(svc).toBeDefined();
    });
  });

  describe('getTrackingDir', () => {
    it('should return path within config directory', () => {
      const dir = service.getTrackingDir('abc123');

      expect(dir).toContain('mcp-configs');
      expect(dir).toContain('abc123');
    });

    it('should return different paths for different hashes', () => {
      const dir1 = service.getTrackingDir('hash1');
      const dir2 = service.getTrackingDir('hash2');

      expect(dir1).not.toBe(dir2);
    });
  });

  describe('track', () => {
    it('should create tracking directory and write tracking file', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockResolvedValue(undefined);

      await service.track('abc123', 'session-1', '/work/dir/.mcp.json');

      expect(mkdirMock).toHaveBeenCalledWith(expect.stringContaining('abc123'), {
        recursive: true,
      });

      expect(writeFileMock).toHaveBeenCalledWith(
        expect.stringContaining('session-1.json'),
        expect.any(String),
        'utf-8'
      );

      // Verify the tracking data content
      const writtenContent = JSON.parse(writeFileMock.mock.calls[0][1]);
      expect(writtenContent.sessionId).toBe('session-1');
      expect(writtenContent.configPath).toBe('/work/dir/.mcp.json');
      expect(writtenContent.createdAt).toBeDefined();
    });

    it('should handle write errors gracefully', async () => {
      mkdirMock.mockResolvedValue(undefined);
      writeFileMock.mockRejectedValue(new Error('Disk full'));

      // Should not throw
      await service.track('abc123', 'session-1', '/path/config');
    });

    it('should handle mkdir errors gracefully', async () => {
      mkdirMock.mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await service.track('abc123', 'session-1', '/path/config');
    });
  });

  describe('listSessions', () => {
    it('should return session IDs from tracking directory', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirMock.mockResolvedValue(['session-1.json', 'session-2.json', 'session-3.json']);

      const sessions = await service.listSessions('abc123');

      expect(sessions).toEqual(['session-1', 'session-2', 'session-3']);
    });

    it('should return empty array when tracking directory does not exist', async () => {
      existsSyncMock.mockReturnValue(false);

      const sessions = await service.listSessions('abc123');

      expect(sessions).toEqual([]);
    });

    it('should only include .json files', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirMock.mockResolvedValue([
        'session-1.json',
        'session-2.json',
        '.DS_Store',
        'readme.txt',
      ]);

      const sessions = await service.listSessions('abc123');

      expect(sessions).toEqual(['session-1', 'session-2']);
    });

    it('should return empty array on read errors', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirMock.mockRejectedValue(new Error('Permission denied'));

      const sessions = await service.listSessions('abc123');

      expect(sessions).toEqual([]);
    });
  });

  describe('cleanup', () => {
    it('should delete tracking file when it exists', async () => {
      existsSyncMock.mockReturnValue(true);
      unlinkMock.mockResolvedValue(undefined);

      await service.cleanup('abc123', 'session-1');

      expect(unlinkMock).toHaveBeenCalledWith(expect.stringContaining('session-1.json'));
    });

    it('should do nothing when tracking file does not exist', async () => {
      existsSyncMock.mockReturnValue(false);

      await service.cleanup('abc123', 'session-1');

      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it('should handle unlink errors gracefully', async () => {
      existsSyncMock.mockReturnValue(true);
      unlinkMock.mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await service.cleanup('abc123', 'session-1');
    });
  });

  describe('getTrackingData', () => {
    it('should return tracking data for existing session', async () => {
      const trackingData = {
        sessionId: 'session-1',
        configPath: '/work/.mcp.json',
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue(JSON.stringify(trackingData));

      const result = await service.getTrackingData('abc123', 'session-1');

      expect(result).toEqual(trackingData);
    });

    it('should return undefined when tracking file does not exist', async () => {
      existsSyncMock.mockReturnValue(false);

      const result = await service.getTrackingData('abc123', 'session-1');

      expect(result).toBeUndefined();
    });

    it('should return undefined on read errors', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockRejectedValue(new Error('Corrupted file'));

      const result = await service.getTrackingData('abc123', 'session-1');

      expect(result).toBeUndefined();
    });

    it('should return undefined on JSON parse errors', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileMock.mockResolvedValue('not valid json');

      const result = await service.getTrackingData('abc123', 'session-1');

      expect(result).toBeUndefined();
    });
  });
});
