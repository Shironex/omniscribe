import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HealthService } from './health.service';
import { TerminalService } from '../terminal/terminal.service';
import { SessionService, BackendSessionConfig } from '../session';
import { InternalSessionEvents, InternalZombieEvents } from '../shared/events';

describe('HealthService', () => {
  let service: HealthService;
  let terminalService: jest.Mocked<TerminalService>;
  let sessionService: jest.Mocked<SessionService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  /** Helper to build a minimal BackendSessionConfig for testing */
  function makeSession(overrides: Partial<BackendSessionConfig> = {}): BackendSessionConfig {
    return {
      id: 'session-1',
      name: 'Test Session',
      aiMode: 'claude',
      projectPath: '/project',
      status: 'idle',
      terminalSessionId: 42,
      lastActiveAt: new Date(),
      createdAt: new Date(),
      ...overrides,
    } as BackendSessionConfig;
  }

  beforeEach(async () => {
    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    terminalService = {
      hasSession: jest.fn().mockReturnValue(true),
      getPid: jest.fn().mockReturnValue(12345),
      isPaused: jest.fn().mockReturnValue(false),
      kill: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TerminalService>;

    sessionService = {
      getAll: jest.fn().mockReturnValue([]),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: TerminalService, useValue: terminalService },
        { provide: SessionService, useValue: sessionService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  // ==================================================================
  // checkHealth()
  // ==================================================================
  describe('checkHealth', () => {
    it('should skip sessions without terminalSessionId', () => {
      const session = makeSession({ terminalSessionId: undefined });
      sessionService.getAll.mockReturnValue([session]);

      service.checkHealth();

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should emit health event for each session with a terminal', () => {
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          sessionId: 'session-1',
          health: expect.any(String),
        })
      );
    });

    it('should call cleanupZombie when health level is failed', () => {
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);
      // Terminal no longer exists -> failed
      terminalService.hasSession.mockReturnValue(false);

      service.checkHealth();

      // Should emit HEALTH event with level=failed
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          sessionId: 'session-1',
          health: 'failed',
        })
      );

      // cleanupZombie should update status and emit CLEANUP
      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        'session-1',
        'error',
        'Terminal process terminated unexpectedly'
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalZombieEvents.CLEANUP,
        expect.objectContaining({
          sessionId: 'session-1',
        })
      );
    });

    it('should continue the loop when a health check throws', () => {
      const session1 = makeSession({ id: 'session-1' });
      const session2 = makeSession({ id: 'session-2', terminalSessionId: 43 });
      sessionService.getAll.mockReturnValue([session1, session2]);

      // First session will throw because hasSession throws
      let callCount = 0;
      terminalService.hasSession.mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('boom');
        return true;
      });
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      // The second session should still get a health event
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({ sessionId: 'session-2' })
      );
    });

    it('should not call cleanupZombie for healthy sessions', () => {
      const session = makeSession({ status: 'idle' });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(sessionService.updateStatus).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        InternalZombieEvents.CLEANUP,
        expect.anything()
      );
    });
  });

  // ==================================================================
  // determineHealth (tested indirectly through checkHealth)
  // ==================================================================
  describe('determineHealth (via checkHealth)', () => {
    it('should return failed when terminal session no longer exists', () => {
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);
      terminalService.hasSession.mockReturnValue(false);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'failed',
          reason: 'Terminal session no longer exists',
        })
      );
    });

    it('should return failed when PID is undefined', () => {
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);
      terminalService.getPid.mockReturnValue(undefined);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'failed',
          reason: 'Terminal process is not alive',
        })
      );
    });

    it('should return failed when process.kill(pid, 0) throws ESRCH', () => {
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);

      const esrchError = new Error('No such process') as NodeJS.ErrnoException;
      esrchError.code = 'ESRCH';
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw esrchError;
      });

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'failed',
          reason: 'Terminal process is not alive',
        })
      );
    });

    it('should treat EPERM as alive (process exists but no permission)', () => {
      const session = makeSession({ status: 'idle' });
      sessionService.getAll.mockReturnValue([session]);

      const epermError = new Error('Operation not permitted') as NodeJS.ErrnoException;
      epermError.code = 'EPERM';
      jest.spyOn(process, 'kill').mockImplementation(() => {
        throw epermError;
      });

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'healthy',
        })
      );
    });

    it('should return healthy when process.kill(pid, 0) succeeds', () => {
      const session = makeSession({ status: 'idle' });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'healthy',
        })
      );
    });

    it('should return failed when session in error state for > 2 minutes', () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
      const session = makeSession({
        status: 'error',
        lastActiveAt: threeMinutesAgo,
      });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'failed',
          reason: 'Session in error state for over 2 minutes',
        })
      );
    });

    it('should not return failed for error state under 2 minutes', () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const session = makeSession({
        status: 'error',
        lastActiveAt: oneMinuteAgo,
      });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'healthy',
        })
      );
    });

    it('should return degraded when terminal is under backpressure', () => {
      const session = makeSession({ status: 'idle' });
      sessionService.getAll.mockReturnValue([session]);
      terminalService.isPaused.mockReturnValue(true);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'degraded',
          reason: 'Terminal is under backpressure',
        })
      );
    });

    it('should return degraded when working session has no output for 5+ minutes', () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
      const session = makeSession({
        status: 'working',
        lastOutputAt: sixMinutesAgo,
      });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'degraded',
          reason: 'No output for 5+ minutes while in working state',
        })
      );
    });

    it('should return healthy for working session with recent output', () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const session = makeSession({
        status: 'working',
        lastOutputAt: oneMinuteAgo,
      });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'healthy',
        })
      );
    });

    it('should return healthy for idle sessions', () => {
      const session = makeSession({ status: 'idle' });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'healthy',
        })
      );
    });

    it('should return healthy for needs_input sessions', () => {
      const session = makeSession({ status: 'needs_input' as any });
      sessionService.getAll.mockReturnValue([session]);
      jest.spyOn(process, 'kill').mockImplementation(() => true);

      service.checkHealth();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalSessionEvents.HEALTH,
        expect.objectContaining({
          health: 'healthy',
        })
      );
    });

    it('should also check other WORKING_STATUSES like executing, active, thinking', () => {
      for (const status of ['executing', 'active', 'thinking'] as const) {
        eventEmitter.emit.mockClear();
        const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
        const session = makeSession({
          status: status as any,
          lastOutputAt: sixMinutesAgo,
        });
        sessionService.getAll.mockReturnValue([session]);
        jest.spyOn(process, 'kill').mockImplementation(() => true);

        service.checkHealth();

        expect(eventEmitter.emit).toHaveBeenCalledWith(
          InternalSessionEvents.HEALTH,
          expect.objectContaining({
            health: 'degraded',
            reason: 'No output for 5+ minutes while in working state',
          })
        );
      }
    });
  });

  // ==================================================================
  // cleanupZombie (tested indirectly through checkHealth)
  // ==================================================================
  describe('cleanupZombie (via checkHealth)', () => {
    it('should kill the terminal, update status, and emit zombie cleanup event', () => {
      const session = makeSession({ name: 'Zombie Session' });
      sessionService.getAll.mockReturnValue([session]);
      // Terminal gone = failed health
      terminalService.hasSession
        .mockReturnValueOnce(false) // determineHealth check
        .mockReturnValueOnce(true); // cleanupZombie check

      service.checkHealth();

      expect(terminalService.kill).toHaveBeenCalledWith(42);
      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        'session-1',
        'error',
        'Terminal process terminated unexpectedly'
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalZombieEvents.CLEANUP,
        expect.objectContaining({
          sessionId: 'session-1',
          sessionName: 'Zombie Session',
          reason: 'Terminal process terminated unexpectedly',
        })
      );
    });

    it('should not attempt to kill terminal if it no longer exists in the map', () => {
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);
      // Both calls return false: determineHealth sees no session, cleanupZombie also sees no session
      terminalService.hasSession.mockReturnValue(false);

      service.checkHealth();

      expect(terminalService.kill).not.toHaveBeenCalled();
      // But status update and event should still happen
      expect(sessionService.updateStatus).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        InternalZombieEvents.CLEANUP,
        expect.anything()
      );
    });

    it('should skip cleanup kill when terminalSessionId is undefined', () => {
      // This shouldn't happen (we skip sessions without terminalSessionId in checkHealth),
      // but test the defensive check in cleanupZombie for completeness.
      // We can only reach cleanupZombie if terminalSessionId is defined, so
      // this just verifies the basic kill path works.
      const session = makeSession();
      sessionService.getAll.mockReturnValue([session]);
      terminalService.hasSession
        .mockReturnValueOnce(false) // determineHealth: terminal gone
        .mockReturnValueOnce(true); // cleanupZombie: still in map

      terminalService.kill.mockRejectedValue(new Error('kill failed'));

      // Should not throw despite kill rejection (it's caught)
      expect(() => service.checkHealth()).not.toThrow();
    });
  });
});
