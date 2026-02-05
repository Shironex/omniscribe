import { Test, TestingModule } from '@nestjs/testing';
import { McpSessionRegistryService } from './mcp-session-registry.service';

describe('McpSessionRegistryService', () => {
  let service: McpSessionRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [McpSessionRegistryService],
    }).compile();

    service = module.get<McpSessionRegistryService>(McpSessionRegistryService);
  });

  describe('registerSession / hasSession / getProjectPath', () => {
    it('should register a session and make it retrievable', () => {
      service.registerSession('session-1', '/project/path');

      expect(service.hasSession('session-1')).toBe(true);
      expect(service.getProjectPath('session-1')).toBe('/project/path');
    });

    it('should return false for unregistered session', () => {
      expect(service.hasSession('nonexistent')).toBe(false);
    });

    it('should return undefined project path for unregistered session', () => {
      expect(service.getProjectPath('nonexistent')).toBeUndefined();
    });

    it('should overwrite project path on re-registration', () => {
      service.registerSession('session-1', '/project/old');
      service.registerSession('session-1', '/project/new');

      expect(service.getProjectPath('session-1')).toBe('/project/new');
    });

    it('should support multiple concurrent sessions', () => {
      service.registerSession('session-1', '/project1');
      service.registerSession('session-2', '/project2');
      service.registerSession('session-3', '/project1');

      expect(service.hasSession('session-1')).toBe(true);
      expect(service.hasSession('session-2')).toBe(true);
      expect(service.hasSession('session-3')).toBe(true);
      expect(service.getProjectPath('session-1')).toBe('/project1');
      expect(service.getProjectPath('session-2')).toBe('/project2');
      expect(service.getProjectPath('session-3')).toBe('/project1');
    });
  });

  describe('unregisterSession', () => {
    it('should remove a registered session', () => {
      service.registerSession('session-1', '/project');

      service.unregisterSession('session-1');

      expect(service.hasSession('session-1')).toBe(false);
      expect(service.getProjectPath('session-1')).toBeUndefined();
    });

    it('should be safe to unregister a non-existent session', () => {
      // Should not throw
      service.unregisterSession('nonexistent');

      expect(service.hasSession('nonexistent')).toBe(false);
    });

    it('should not affect other sessions', () => {
      service.registerSession('session-1', '/project1');
      service.registerSession('session-2', '/project2');

      service.unregisterSession('session-1');

      expect(service.hasSession('session-1')).toBe(false);
      expect(service.hasSession('session-2')).toBe(true);
    });

    it('should clean up enabled servers for the session', () => {
      service.registerSession('session-1', '/project');
      service.setEnabledServers('/project', 'session-1', ['server-a', 'server-b']);

      service.unregisterSession('session-1');

      expect(service.getEnabledServers('/project', 'session-1')).toEqual([]);
    });
  });

  describe('getRegisteredSessions', () => {
    it('should return empty array when no sessions registered', () => {
      expect(service.getRegisteredSessions()).toEqual([]);
    });

    it('should return all registered session IDs', () => {
      service.registerSession('session-1', '/project1');
      service.registerSession('session-2', '/project2');
      service.registerSession('session-3', '/project3');

      const sessions = service.getRegisteredSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
      expect(sessions).toContain('session-3');
    });

    it('should not include unregistered sessions', () => {
      service.registerSession('session-1', '/project1');
      service.registerSession('session-2', '/project2');
      service.unregisterSession('session-1');

      const sessions = service.getRegisteredSessions();

      expect(sessions).toEqual(['session-2']);
    });
  });

  describe('setEnabledServers / getEnabledServers', () => {
    it('should store and retrieve enabled servers', () => {
      service.setEnabledServers('/project', 'session-1', ['server-a', 'server-b']);

      const result = service.getEnabledServers('/project', 'session-1');

      expect(result).toEqual(['server-a', 'server-b']);
    });

    it('should return empty array when no servers are set', () => {
      const result = service.getEnabledServers('/project', 'session-1');

      expect(result).toEqual([]);
    });

    it('should scope enabled servers by project+session key', () => {
      service.setEnabledServers('/project1', 'session-1', ['server-a']);
      service.setEnabledServers('/project2', 'session-1', ['server-b']);
      service.setEnabledServers('/project1', 'session-2', ['server-c']);

      expect(service.getEnabledServers('/project1', 'session-1')).toEqual(['server-a']);
      expect(service.getEnabledServers('/project2', 'session-1')).toEqual(['server-b']);
      expect(service.getEnabledServers('/project1', 'session-2')).toEqual(['server-c']);
    });

    it('should overwrite previous enabled servers', () => {
      service.setEnabledServers('/project', 'session-1', ['server-a']);
      service.setEnabledServers('/project', 'session-1', ['server-b', 'server-c']);

      const result = service.getEnabledServers('/project', 'session-1');

      expect(result).toEqual(['server-b', 'server-c']);
    });

    it('should allow setting empty array', () => {
      service.setEnabledServers('/project', 'session-1', ['server-a']);
      service.setEnabledServers('/project', 'session-1', []);

      const result = service.getEnabledServers('/project', 'session-1');

      expect(result).toEqual([]);
    });
  });

  describe('clearEnabledServers', () => {
    it('should remove enabled servers for a session', () => {
      service.setEnabledServers('/project', 'session-1', ['server-a']);

      service.clearEnabledServers('/project', 'session-1');

      expect(service.getEnabledServers('/project', 'session-1')).toEqual([]);
    });

    it('should not affect other sessions', () => {
      service.setEnabledServers('/project', 'session-1', ['server-a']);
      service.setEnabledServers('/project', 'session-2', ['server-b']);

      service.clearEnabledServers('/project', 'session-1');

      expect(service.getEnabledServers('/project', 'session-1')).toEqual([]);
      expect(service.getEnabledServers('/project', 'session-2')).toEqual(['server-b']);
    });

    it('should be safe to clear non-existent entry', () => {
      // Should not throw
      service.clearEnabledServers('/project', 'nonexistent');
    });
  });
});
