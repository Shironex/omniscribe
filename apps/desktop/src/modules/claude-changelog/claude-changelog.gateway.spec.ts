import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Socket } from 'socket.io';

import { ClaudeChangelogGateway } from './claude-changelog.gateway';
import { ClaudeChangelogService } from './claude-changelog.service';

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

describe('ClaudeChangelogGateway', () => {
  let gateway: ClaudeChangelogGateway;
  let service: jest.Mocked<ClaudeChangelogService>;
  let socket: Socket;

  beforeEach(async () => {
    service = {
      fetchChangelog: jest.fn(),
    } as unknown as jest.Mocked<ClaudeChangelogService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [ClaudeChangelogGateway, { provide: ClaudeChangelogService, useValue: service }],
    }).compile();

    gateway = module.get(ClaudeChangelogGateway);
    socket = createMockSocket();
  });

  describe('handleFetch', () => {
    it('forwards forceRefresh=false by default', async () => {
      service.fetchChangelog.mockResolvedValue({
        data: {
          rawMarkdown: '## 1.0.0\n\n- a',
          entries: [{ version: '1.0.0', bodyMarkdown: '- a' }],
          fetchedAt: 1,
          sourceUrl: 'https://example.test',
          fromCache: false,
        },
      });

      const result = await gateway.handleFetch(socket, undefined);

      expect(service.fetchChangelog).toHaveBeenCalledWith(false);
      expect(result.data?.entries[0].version).toBe('1.0.0');
    });

    it('passes forceRefresh through when set', async () => {
      service.fetchChangelog.mockResolvedValue({
        data: {
          rawMarkdown: '',
          entries: [],
          fetchedAt: 0,
          sourceUrl: '',
          fromCache: false,
        },
      });

      await gateway.handleFetch(socket, { forceRefresh: true });

      expect(service.fetchChangelog).toHaveBeenCalledWith(true);
    });

    it('returns unknown error when the service throws', async () => {
      service.fetchChangelog.mockRejectedValue(new Error('boom'));

      const result = await gateway.handleFetch(socket, undefined);

      expect(result.error).toBe('unknown');
      expect(result.message).toBe('boom');
    });

    it('propagates service-side errors as-is', async () => {
      service.fetchChangelog.mockResolvedValue({
        error: 'network',
        message: 'offline',
      });

      const result = await gateway.handleFetch(socket, undefined);

      expect(result).toEqual({ error: 'network', message: 'offline' });
    });
  });

  describe('handleRefresh', () => {
    it('always invokes fetchChangelog with forceRefresh=true', async () => {
      service.fetchChangelog.mockResolvedValue({
        data: {
          rawMarkdown: '',
          entries: [],
          fetchedAt: 0,
          sourceUrl: '',
          fromCache: false,
        },
      });

      await gateway.handleRefresh(socket);

      expect(service.fetchChangelog).toHaveBeenCalledWith(true);
    });

    it('returns unknown error on exception', async () => {
      service.fetchChangelog.mockRejectedValue('string-thrown');

      const result = await gateway.handleRefresh(socket);

      expect(result.error).toBe('unknown');
      expect(result.message).toBe('string-thrown');
    });
  });
});
