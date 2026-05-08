import { Test, TestingModule } from '@nestjs/testing';
import { CustomCommandService } from './custom-command.service';
import { WorkspaceService } from './workspace.service';
import { SessionService, SessionLauncherService } from '../session';
import { TerminalService } from '../terminal/terminal.service';
import type { CustomCommand } from '@omniscribe/shared';

describe('CustomCommandService', () => {
  let service: CustomCommandService;
  let workspaceService: jest.Mocked<WorkspaceService>;
  let sessionService: jest.Mocked<SessionService>;
  let sessionLauncher: jest.Mocked<SessionLauncherService>;
  let terminalService: jest.Mocked<TerminalService>;

  const projectPath = '/some/project';

  const sampleCommand: CustomCommand = {
    id: 'cmd-1',
    label: 'List files',
    icon: 'Folder',
    command: 'ls -la',
    createdAt: '2026-05-08T10:00:00.000Z',
    updatedAt: '2026-05-08T10:00:00.000Z',
  };

  beforeEach(async () => {
    workspaceService = {
      getProjectCustomCommands: jest.fn().mockReturnValue([]),
      getProjectCustomCommand: jest.fn(),
      addProjectCustomCommand: jest.fn(),
      updateProjectCustomCommand: jest.fn(),
      removeProjectCustomCommand: jest.fn(),
    } as unknown as jest.Mocked<WorkspaceService>;

    sessionService = {
      getRunningSessions: jest.fn().mockReturnValue([]),
      create: jest.fn().mockReturnValue({ id: 'session-99' }),
      remove: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<SessionService>;

    sessionLauncher = {
      launchSession: jest.fn().mockResolvedValue({ success: true, terminalSessionId: 42 }),
    } as unknown as jest.Mocked<SessionLauncherService>;

    terminalService = {
      hasSession: jest.fn().mockReturnValue(true),
      write: jest.fn(),
    } as unknown as jest.Mocked<TerminalService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomCommandService,
        { provide: WorkspaceService, useValue: workspaceService },
        { provide: SessionService, useValue: sessionService },
        { provide: SessionLauncherService, useValue: sessionLauncher },
        { provide: TerminalService, useValue: terminalService },
      ],
    }).compile();

    service = module.get<CustomCommandService>(CustomCommandService);
  });

  describe('list / create / update / remove', () => {
    it('returns the workspace store list', () => {
      workspaceService.getProjectCustomCommands.mockReturnValue([sampleCommand]);
      expect(service.list(projectPath)).toEqual([sampleCommand]);
      expect(workspaceService.getProjectCustomCommands).toHaveBeenCalledWith(projectPath);
    });

    it('rejects empty labels on create', () => {
      expect(() =>
        service.create(projectPath, { label: '   ', icon: 'Play', command: 'echo hi' })
      ).toThrow(/Label/);
    });

    it('rejects empty commands on create', () => {
      expect(() => service.create(projectPath, { label: 'Hi', icon: 'Play', command: '' })).toThrow(
        /Command/
      );
    });

    it('trims label and falls back to default icon when icon is blank', () => {
      workspaceService.addProjectCustomCommand.mockReturnValue(sampleCommand);
      service.create(projectPath, { label: '  Run app  ', icon: '   ', command: 'pnpm dev' });
      expect(workspaceService.addProjectCustomCommand).toHaveBeenCalledWith(projectPath, {
        label: 'Run app',
        icon: 'Terminal',
        command: 'pnpm dev',
      });
    });

    it('passes only sanitized fields to update', () => {
      workspaceService.updateProjectCustomCommand.mockReturnValue(sampleCommand);
      service.update(projectPath, 'cmd-1', { label: '  Updated  ' });
      expect(workspaceService.updateProjectCustomCommand).toHaveBeenCalledWith(
        projectPath,
        'cmd-1',
        { label: 'Updated' }
      );
    });

    it('rejects an empty label update', () => {
      expect(() => service.update(projectPath, 'cmd-1', { label: '   ' })).toThrow();
    });

    it('delegates remove to the workspace service', () => {
      workspaceService.removeProjectCustomCommand.mockReturnValue(true);
      expect(service.remove(projectPath, 'cmd-1')).toBe(true);
      expect(workspaceService.removeProjectCustomCommand).toHaveBeenCalledWith(
        projectPath,
        'cmd-1'
      );
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('throws when the command id is unknown', async () => {
      workspaceService.getProjectCustomCommand.mockReturnValue(undefined);
      await expect(service.execute(projectPath, 'missing')).rejects.toThrow(/not found/);
      expect(sessionService.create).not.toHaveBeenCalled();
    });

    it('creates a plain session, launches it, and writes the command after a delay', async () => {
      workspaceService.getProjectCustomCommand.mockReturnValue(sampleCommand);

      const result = await service.execute(projectPath, sampleCommand.id);
      expect(result.sessionId).toBe('session-99');

      expect(sessionService.create).toHaveBeenCalledWith('plain', projectPath, {
        name: sampleCommand.label,
        workingDirectory: projectPath,
      });
      expect(sessionLauncher.launchSession).toHaveBeenCalledWith(
        'session-99',
        projectPath,
        projectPath,
        'plain'
      );

      // The write is scheduled after the launch returns; advance timers.
      expect(terminalService.write).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(terminalService.write).toHaveBeenCalledWith(42, expect.stringContaining('ls -la'));
    });

    it('cleans up the session when launch fails', async () => {
      workspaceService.getProjectCustomCommand.mockReturnValue(sampleCommand);
      sessionLauncher.launchSession.mockResolvedValueOnce({ success: false, error: 'nope' });

      await expect(service.execute(projectPath, sampleCommand.id)).rejects.toThrow(/nope/);
      expect(sessionService.remove).toHaveBeenCalledWith('session-99');
    });

    it('skips the write if the terminal closed before the delay elapsed', async () => {
      workspaceService.getProjectCustomCommand.mockReturnValue(sampleCommand);
      terminalService.hasSession.mockReturnValue(false);

      await service.execute(projectPath, sampleCommand.id);
      jest.runAllTimers();
      expect(terminalService.write).not.toHaveBeenCalled();
    });
  });
});
