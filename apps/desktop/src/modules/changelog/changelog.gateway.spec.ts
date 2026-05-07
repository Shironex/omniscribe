import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Socket } from 'socket.io';

import { ChangelogGateway } from './changelog.gateway';
import { ChangelogService } from './changelog.service';
import { ChangelogRegistryService } from './changelog-registry.service';

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

describe('ChangelogGateway', () => {
  let gateway: ChangelogGateway;
  let service: jest.Mocked<ChangelogService>;
  let registry: jest.Mocked<ChangelogRegistryService>;
  let socket: Socket;

  beforeEach(async () => {
    service = {
      fetchChangelog: jest.fn(),
    } as unknown as jest.Mocked<ChangelogService>;
    registry = {
      register: jest.fn(),
      unregister: jest.fn(),
    } as unknown as jest.Mocked<ChangelogRegistryService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [
        ChangelogGateway,
        { provide: ChangelogService, useValue: service },
        { provide: ChangelogRegistryService, useValue: registry },
      ],
    }).compile();

    gateway = module.get(ChangelogGateway);
    socket = createMockSocket();
  });

  describe('handleFetch', () => {
    it('rejects when sourceId is missing', async () => {
      const result = await gateway.handleFetch(socket, undefined);
      expect(result.error).toBe('unknown');
      expect(service.fetchChangelog).not.toHaveBeenCalled();
    });

    it('forwards sourceId and forceRefresh=false by default', async () => {
      service.fetchChangelog.mockResolvedValue({
        data: {
          sourceId: 'claude',
          entries: [{ version: '1.0.0', bodyMarkdown: '- a' }],
          fetchedAt: 1,
          sourceUrl: 'https://example.test',
          fromCache: false,
        },
      });

      const result = await gateway.handleFetch(socket, { sourceId: 'claude' });

      expect(service.fetchChangelog).toHaveBeenCalledWith('claude', false);
      expect(result.data?.entries[0].version).toBe('1.0.0');
    });

    it('passes forceRefresh through when set', async () => {
      service.fetchChangelog.mockResolvedValue({
        data: {
          sourceId: 'claude',
          entries: [],
          fetchedAt: 0,
          sourceUrl: '',
          fromCache: false,
        },
      });

      await gateway.handleFetch(socket, { sourceId: 'claude', forceRefresh: true });

      expect(service.fetchChangelog).toHaveBeenCalledWith('claude', true);
    });

    it('returns unknown error when the service throws', async () => {
      service.fetchChangelog.mockRejectedValue(new Error('boom'));

      const result = await gateway.handleFetch(socket, { sourceId: 'claude' });

      expect(result.error).toBe('unknown');
      expect(result.message).toBe('boom');
    });

    it('propagates service-side errors as-is', async () => {
      service.fetchChangelog.mockResolvedValue({ error: 'network', message: 'offline' });

      const result = await gateway.handleFetch(socket, { sourceId: 'claude' });

      expect(result).toEqual({ error: 'network', message: 'offline' });
    });
  });

  describe('handleRefresh', () => {
    it('rejects when sourceId is missing', async () => {
      const result = await gateway.handleRefresh(socket, undefined);
      expect(result.error).toBe('unknown');
      expect(service.fetchChangelog).not.toHaveBeenCalled();
    });

    it('always invokes fetchChangelog with forceRefresh=true', async () => {
      service.fetchChangelog.mockResolvedValue({
        data: {
          sourceId: 'claude',
          entries: [],
          fetchedAt: 0,
          sourceUrl: '',
          fromCache: false,
        },
      });

      await gateway.handleRefresh(socket, { sourceId: 'claude' });

      expect(service.fetchChangelog).toHaveBeenCalledWith('claude', true);
    });
  });

  describe('handleRegisterSource', () => {
    it('forwards a valid registration to the registry', () => {
      const result = gateway.handleRegisterSource(socket, {
        id: 'claude',
        source: { kind: 'github-markdown', url: 'https://example' },
      });
      expect(result.success).toBe(true);
      expect(registry.register).toHaveBeenCalled();
    });

    it('rejects payloads missing id', () => {
      const result = gateway.handleRegisterSource(socket, {
        // @ts-expect-error testing missing id
        source: { kind: 'github-markdown', url: 'https://example' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('handleUnregisterSource', () => {
    it('forwards to the registry', () => {
      const result = gateway.handleUnregisterSource(socket, { id: 'claude' });
      expect(result.success).toBe(true);
      expect(registry.unregister).toHaveBeenCalledWith('claude');
    });
  });
});
