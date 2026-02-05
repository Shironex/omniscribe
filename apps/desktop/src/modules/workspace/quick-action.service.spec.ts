import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QuickActionService } from './quick-action.service';
import { TerminalService } from '../terminal/terminal.service';
import { GitService } from '../git/git.service';
import { SessionService } from '../session/session.service';
import type { QuickAction } from '@omniscribe/shared';

describe('QuickActionService', () => {
  let service: QuickActionService;
  let terminalService: jest.Mocked<TerminalService>;
  let gitService: jest.Mocked<GitService>;
  let sessionService: jest.Mocked<SessionService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    terminalService = {
      spawn: jest.fn().mockReturnValue(1),
      hasSession: jest.fn().mockReturnValue(true),
      write: jest.fn(),
    } as unknown as jest.Mocked<TerminalService>;

    gitService = {
      isGitRepository: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<GitService>;

    sessionService = {
      get: jest.fn().mockReturnValue({
        id: 'session-1',
        projectPath: '/project',
        status: 'idle',
      }),
      updateStatus: jest.fn(),
    } as unknown as jest.Mocked<SessionService>;

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickActionService,
        { provide: TerminalService, useValue: terminalService },
        { provide: GitService, useValue: gitService },
        { provide: SessionService, useValue: sessionService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<QuickActionService>(QuickActionService);
  });

  /**
   * Helper to build a QuickAction with sensible defaults
   */
  function makeAction(overrides: Partial<QuickAction>): QuickAction {
    return {
      id: 'test-action',
      title: 'Test Action',
      category: 'general',
      handler: 'terminal:execute',
      ...overrides,
    } as QuickAction;
  }

  // =========================================================
  // terminal:execute handler
  // =========================================================

  describe('terminal:execute', () => {
    it('should write command to existing terminal session', async () => {
      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'npm test' },
      });

      const result = await service.executeAction('session-1', action, {
        terminalSessionId: 5,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('npm test');
      expect(terminalService.write).toHaveBeenCalledWith(5, 'npm test\n');
      expect(terminalService.spawn).not.toHaveBeenCalled();
    });

    it('should spawn new terminal when no terminalSessionId provided', async () => {
      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'ls -la' },
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/project',
      });

      expect(result.success).toBe(true);
      expect(terminalService.spawn).toHaveBeenCalledWith('/project');
      expect(terminalService.write).toHaveBeenCalledWith(1, 'ls -la\n');
    });

    it('should spawn new terminal when terminalSessionId does not exist', async () => {
      terminalService.hasSession.mockReturnValue(false);

      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'echo hello' },
      });

      const result = await service.executeAction('session-1', action, {
        terminalSessionId: 999,
        projectPath: '/myproject',
      });

      expect(result.success).toBe(true);
      expect(terminalService.spawn).toHaveBeenCalledWith('/myproject');
      expect(terminalService.write).toHaveBeenCalledWith(1, 'echo hello\n');
    });

    it('should return error when no command specified', async () => {
      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: '' },
      });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No command specified');
    });

    it('should return error when command is undefined', async () => {
      const action = makeAction({
        handler: 'terminal:execute',
        params: {},
      });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No command specified');
    });

    it('should emit quickaction.executed event', async () => {
      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'npm test' },
      });

      await service.executeAction('session-1', action, { terminalSessionId: 3 });

      expect(eventEmitter.emit).toHaveBeenCalledWith('quickaction.executed', {
        handler: 'terminal:execute',
        terminalId: 3,
        command: 'npm test',
      });
    });

    it('should return terminalId in data', async () => {
      terminalService.spawn.mockReturnValue(42);

      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'pwd' },
      });

      const result = await service.executeAction('session-1', action);

      expect(result.data).toEqual({
        terminalId: 42,
        command: 'pwd',
      });
    });
  });

  // =========================================================
  // git:commit-push handler
  // =========================================================

  describe('git:commit-push', () => {
    it('should stage, commit, and push via terminal', async () => {
      const action = makeAction({
        handler: 'git:commit-push',
        params: { message: 'fix: resolve bug' },
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('committing');
      expect(gitService.isGitRepository).toHaveBeenCalledWith('/repo');
      expect(terminalService.spawn).toHaveBeenCalledWith('/repo');
      // Should write git commands to terminal
      expect(terminalService.write).toHaveBeenCalledWith(1, expect.stringContaining('git add -A'));
      expect(terminalService.write).toHaveBeenCalledWith(
        1,
        expect.stringContaining('git commit -m')
      );
      expect(terminalService.write).toHaveBeenCalledWith(1, expect.stringContaining('git push'));
    });

    it('should generate auto-commit message when none provided', async () => {
      const action = makeAction({
        handler: 'git:commit-push',
        params: {},
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(result.success).toBe(true);
      expect(result.data?.commitMessage).toContain('Auto-commit:');
    });

    it('should return error when no project path specified', async () => {
      const action = makeAction({
        handler: 'git:commit-push',
        params: { message: 'test' },
      });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project path specified');
    });

    it('should return error when not a git repository', async () => {
      gitService.isGitRepository.mockResolvedValue(false);

      const action = makeAction({
        handler: 'git:commit-push',
        params: { message: 'test' },
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/not-a-repo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a git repository');
    });

    it('should properly escape commit messages with single quotes', async () => {
      const action = makeAction({
        handler: 'git:commit-push',
        params: { message: "fix: don't break things" },
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(result.success).toBe(true);
      // The written command should contain escaped single quotes
      const writtenCommand = terminalService.write.mock.calls[0][1];
      expect(writtenCommand).toContain('git commit -m');
      // Shell escaping replaces ' with '\'' (end quote, escaped quote, start quote)
      // So "don't" becomes "don'\''t" inside the outer single quotes
      expect(writtenCommand).toContain("don'\\''t");
    });

    it('should emit quickaction.executed event with context', async () => {
      const action = makeAction({
        handler: 'git:commit-push',
        params: { message: 'feat: new feature' },
      });

      await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('quickaction.executed', {
        handler: 'git:commit-push',
        terminalId: 1,
        repoPath: '/repo',
        commitMessage: 'feat: new feature',
      });
    });
  });

  // =========================================================
  // git:pull handler
  // =========================================================

  describe('git:pull', () => {
    it('should execute git pull via terminal', async () => {
      const action = makeAction({ handler: 'git:pull' });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Pulling');
      expect(gitService.isGitRepository).toHaveBeenCalledWith('/repo');
      expect(terminalService.spawn).toHaveBeenCalledWith('/repo');
      expect(terminalService.write).toHaveBeenCalledWith(1, 'git pull\n');
    });

    it('should return error when no project path specified', async () => {
      const action = makeAction({ handler: 'git:pull' });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No project path specified');
    });

    it('should return error when not a git repository', async () => {
      gitService.isGitRepository.mockResolvedValue(false);
      const action = makeAction({ handler: 'git:pull' });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/not-git',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not a git repository');
    });

    it('should emit quickaction.executed event', async () => {
      const action = makeAction({ handler: 'git:pull' });

      await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith('quickaction.executed', {
        handler: 'git:pull',
        terminalId: 1,
        repoPath: '/repo',
      });
    });

    it('should return terminalId and repoPath in data', async () => {
      terminalService.spawn.mockReturnValue(7);
      const action = makeAction({ handler: 'git:pull' });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/myrepo',
      });

      expect(result.data).toEqual({
        terminalId: 7,
        repoPath: '/myrepo',
      });
    });
  });

  // =========================================================
  // ai:fix-errors handler
  // =========================================================

  describe('ai:fix-errors', () => {
    it('should emit AI prompt and update session status', async () => {
      const action = makeAction({ handler: 'ai:fix-errors' });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/project',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('fix-errors');
      expect(result.data).toEqual({
        sessionId: 'session-1',
        action: 'fix-errors',
      });
    });

    it('should emit quickaction.ai.prompt event with correct payload', async () => {
      const action = makeAction({ handler: 'ai:fix-errors' });

      await service.executeAction('session-1', action, {
        projectPath: '/project',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'quickaction.ai.prompt',
        expect.objectContaining({
          sessionId: 'session-1',
          action: 'fix-errors',
          projectPath: '/project',
        })
      );
      // Prompt should mention error analysis
      const emitCall = eventEmitter.emit.mock.calls.find(c => c[0] === 'quickaction.ai.prompt');
      expect(emitCall).toBeDefined();
      expect(emitCall![1].prompt).toContain('compilation errors');
    });

    it('should update session status to thinking', async () => {
      const action = makeAction({ handler: 'ai:fix-errors' });

      await service.executeAction('session-1', action);

      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        'session-1',
        'thinking',
        'Analyzing errors...'
      );
    });

    it('should return error when session not found', async () => {
      sessionService.get.mockReturnValue(undefined);
      const action = makeAction({ handler: 'ai:fix-errors' });

      const result = await service.executeAction('nonexistent', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should use session projectPath when context projectPath is not provided', async () => {
      const action = makeAction({ handler: 'ai:fix-errors' });

      await service.executeAction('session-1', action);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'quickaction.ai.prompt',
        expect.objectContaining({
          projectPath: '/project', // from the session mock
        })
      );
    });

    it('should prefer context projectPath over session projectPath', async () => {
      const action = makeAction({ handler: 'ai:fix-errors' });

      await service.executeAction('session-1', action, {
        projectPath: '/override-path',
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'quickaction.ai.prompt',
        expect.objectContaining({
          projectPath: '/override-path',
        })
      );
    });
  });

  // =========================================================
  // ai:explain handler
  // =========================================================

  describe('ai:explain', () => {
    it('should emit AI prompt with target when provided', async () => {
      const action = makeAction({
        handler: 'ai:explain',
        params: { target: 'function doStuff() {}' },
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/project',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        sessionId: 'session-1',
        action: 'explain',
        target: 'function doStuff() {}',
      });

      const emitCall = eventEmitter.emit.mock.calls.find(c => c[0] === 'quickaction.ai.prompt');
      expect(emitCall![1].prompt).toContain('function doStuff() {}');
    });

    it('should emit generic explain prompt when no target provided', async () => {
      const action = makeAction({
        handler: 'ai:explain',
        params: {},
      });

      await service.executeAction('session-1', action);

      const emitCall = eventEmitter.emit.mock.calls.find(c => c[0] === 'quickaction.ai.prompt');
      expect(emitCall![1].prompt).toContain('current file or selected code');
    });

    it('should update session status to thinking', async () => {
      const action = makeAction({
        handler: 'ai:explain',
        params: { target: 'code' },
      });

      await service.executeAction('session-1', action);

      expect(sessionService.updateStatus).toHaveBeenCalledWith(
        'session-1',
        'thinking',
        'Generating explanation...'
      );
    });

    it('should return error when session not found', async () => {
      sessionService.get.mockReturnValue(undefined);
      const action = makeAction({
        handler: 'ai:explain',
        params: { target: 'code' },
      });

      const result = await service.executeAction('nonexistent', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Session not found');
    });

    it('should use session projectPath as fallback', async () => {
      const action = makeAction({
        handler: 'ai:explain',
        params: {},
      });

      await service.executeAction('session-1', action);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'quickaction.ai.prompt',
        expect.objectContaining({
          projectPath: '/project',
        })
      );
    });
  });

  // =========================================================
  // Unknown handler
  // =========================================================

  describe('unknown handler', () => {
    it('should return error for unrecognized handler', async () => {
      const action = makeAction({ handler: 'nonexistent:action' });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown handler');
      expect(result.error).toContain('nonexistent:action');
    });
  });

  // =========================================================
  // Error handling
  // =========================================================

  describe('error handling', () => {
    it('should catch errors thrown by handlers and return error result', async () => {
      terminalService.spawn.mockImplementation(() => {
        throw new Error('PTY failed to spawn');
      });

      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'test' },
      });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toBe('PTY failed to spawn');
    });

    it('should handle non-Error thrown values', async () => {
      terminalService.spawn.mockImplementation(() => {
        throw 'string error'; // eslint-disable-line no-throw-literal
      });

      const action = makeAction({
        handler: 'terminal:execute',
        params: { command: 'test' },
      });

      const result = await service.executeAction('session-1', action);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error occurred');
    });

    it('should catch async errors from git operations', async () => {
      gitService.isGitRepository.mockRejectedValue(new Error('git binary not found'));

      const action = makeAction({
        handler: 'git:commit-push',
        params: { message: 'test' },
      });

      const result = await service.executeAction('session-1', action, {
        projectPath: '/repo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('git binary not found');
    });
  });
});
