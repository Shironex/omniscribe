import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TerminalService } from './terminal.service';
import { MockPty } from '../../../test/mocks';

// Mock node-pty
const mockPtyInstances: MockPty[] = [];
jest.mock('node-pty', () => ({
  spawn: jest.fn(() => {
    const instance = new MockPty();
    mockPtyInstances.push(instance);
    return instance;
  }),
}));

describe('TerminalService', () => {
  let service: TerminalService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    mockPtyInstances.length = 0;

    eventEmitter = {
      emit: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    } as unknown as EventEmitter2;

    const module: TestingModule = await Test.createTestingModule({
      providers: [TerminalService, { provide: EventEmitter2, useValue: eventEmitter }],
    }).compile();

    service = module.get<TerminalService>(TerminalService);
  });

  afterEach(() => {
    // Clear any timers from output batching
    jest.clearAllTimers();
  });

  describe('spawnCommand', () => {
    it('should create a new PTY session and return a session ID', () => {
      const sessionId = service.spawnCommand('bash', ['-l'], '/home/user');

      expect(sessionId).toBe(1);
      expect(mockPtyInstances).toHaveLength(1);
    });

    it('should increment session IDs', () => {
      const id1 = service.spawnCommand('bash', [], '/home');
      const id2 = service.spawnCommand('bash', [], '/home');

      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it('should store the session for later access', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');

      expect(service.hasSession(sessionId)).toBe(true);
    });

    it('should track the external ID when provided', () => {
      const sessionId = service.spawnCommand(
        'claude',
        ['--model', 'opus'],
        '/project',
        {},
        'session-1-123'
      );

      expect(service.getExternalId(sessionId)).toBe('session-1-123');
    });

    it('should pass environment variables to the PTY', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pty = require('node-pty');
      service.spawnCommand('bash', [], '/home', { MY_VAR: 'test' });

      const spawnCall = pty.spawn.mock.calls[0];
      const options = spawnCall[2];
      expect(options.env).toEqual(expect.objectContaining({ MY_VAR: 'test' }));
    });
  });

  describe('output batching', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should batch output and emit after BATCH_INTERVAL_MS', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      ptyInstance.simulateData('hello ');
      ptyInstance.simulateData('world');

      // Not emitted yet (still within batch interval)
      expect(eventEmitter.emit).not.toHaveBeenCalledWith('terminal.output', expect.anything());

      // Advance timers past the 16ms batch interval
      jest.advanceTimersByTime(20);

      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.output', {
        sessionId,
        data: 'hello world',
      });
    });
  });

  describe('onExit', () => {
    it('should emit terminal.closed and remove session on exit', () => {
      const sessionId = service.spawnCommand('bash', [], '/home', {}, 'ext-1');
      const ptyInstance = mockPtyInstances[0];

      ptyInstance.simulateExit(0);

      expect(eventEmitter.emit).toHaveBeenCalledWith('terminal.closed', {
        sessionId,
        externalId: 'ext-1',
        exitCode: 0,
        signal: undefined,
      });
      expect(service.hasSession(sessionId)).toBe(false);
    });
  });

  describe('write', () => {
    it('should write data to the PTY process', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.write(sessionId, 'ls\n');

      expect(ptyInstance.write).toHaveBeenCalledWith('ls\n');
    });

    it('should do nothing for non-existent sessions', () => {
      // Should not throw
      service.write(999, 'data');
    });
  });

  describe('resize', () => {
    it('should resize the PTY process', () => {
      const sessionId = service.spawnCommand('bash', [], '/home');
      const ptyInstance = mockPtyInstances[0];

      service.resize(sessionId, 120, 40);

      expect(ptyInstance.resize).toHaveBeenCalledWith(120, 40);
    });
  });

  describe('kill', () => {
    it('should remove the session after killing', async () => {
      const sessionId = service.spawnCommand('bash', [], '/home');

      await service.kill(sessionId);

      expect(service.hasSession(sessionId)).toBe(false);
    });

    it('should do nothing for non-existent sessions', async () => {
      // Should not throw
      await service.kill(999);
    });
  });

  describe('findByExternalId', () => {
    it('should find a terminal session by external ID', () => {
      const sessionId = service.spawnCommand('bash', [], '/home', {}, 'ext-session-1');

      expect(service.findByExternalId('ext-session-1')).toBe(sessionId);
    });

    it('should return undefined for unknown external ID', () => {
      expect(service.findByExternalId('nonexistent')).toBeUndefined();
    });
  });

  describe('getSessionIds', () => {
    it('should return all active session IDs', () => {
      const id1 = service.spawnCommand('bash', [], '/home');
      const id2 = service.spawnCommand('bash', [], '/home');

      expect(service.getSessionIds()).toEqual([id1, id2]);
    });
  });
});
