import { Test, TestingModule } from '@nestjs/testing';

jest.mock('electron-store', () => {
  const { createElectronStoreMock } = jest.requireActual('../../../test/mocks/electron-store.mock');
  return createElectronStoreMock();
});

jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: jest.fn().mockReturnValue([]) },
  dialog: { showMessageBox: jest.fn() },
}));

jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { dialog } from 'electron';
import { DeepLinkService } from './deep-link.service';
import { SessionLauncherService } from '../session/session-launcher.service';
import { PluginRegistryService } from '../plugin';
import { WorkspaceService } from '../workspace/workspace.service';

const mockSessionLauncher = {
  launch: jest.fn().mockResolvedValue({ session: { id: 'session-1' } }),
};

const mockPluginRegistry = {
  isValidMode: jest
    .fn()
    .mockImplementation((mode: string) => mode === 'claude' || mode === 'plain'),
};

const mockWorkspaceService = {
  getTabs: jest.fn().mockReturnValue([]),
  addTab: jest.fn().mockReturnValue([]),
};

describe('DeepLinkService', () => {
  let service: DeepLinkService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessionLauncher.launch.mockResolvedValue({ session: { id: 'session-1' } });
    mockPluginRegistry.isValidMode.mockImplementation(
      (mode: string) => mode === 'claude' || mode === 'plain'
    );
    mockWorkspaceService.getTabs.mockReturnValue([]);
    (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepLinkService,
        { provide: SessionLauncherService, useValue: mockSessionLauncher },
        { provide: PluginRegistryService, useValue: mockPluginRegistry },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
      ],
    }).compile();

    service = module.get<DeepLinkService>(DeepLinkService);
  });

  function url(params: Record<string, string>): string {
    const qs = new URLSearchParams(params).toString();
    return `omniscribe://run?${qs}`;
  }

  describe('handleRun', () => {
    it('should launch when project is in workspace tabs (auto-trusted)', async () => {
      mockWorkspaceService.getTabs.mockReturnValue([
        {
          id: 't1',
          projectPath: '/Users/me/project',
          name: 'project',
          sessionIds: [],
          isActive: true,
          lastAccessedAt: '2024-01-01',
        },
      ]);

      await service.handleRun(url({ project: '/Users/me/project', provider: 'claude' }));

      expect(dialog.showMessageBox).not.toHaveBeenCalled();
      expect(mockSessionLauncher.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/Users/me/project',
          mode: 'claude',
          source: 'deeplink',
        })
      );
    });

    it('should prompt and launch on "Allow once"', async () => {
      (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 });

      await service.handleRun(url({ project: '/Users/me/new', provider: 'claude' }));

      expect(dialog.showMessageBox).toHaveBeenCalled();
      expect(mockSessionLauncher.launch).toHaveBeenCalled();
    });

    it('should prompt, persist, and launch on "Allow always"', async () => {
      (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 });

      await service.handleRun(url({ project: '/Users/me/new', provider: 'claude' }));

      expect(mockSessionLauncher.launch).toHaveBeenCalled();

      // Second call to the same path should not prompt
      (dialog.showMessageBox as jest.Mock).mockClear();
      await service.handleRun(url({ project: '/Users/me/new', provider: 'claude' }));

      expect(dialog.showMessageBox).not.toHaveBeenCalled();
      expect(mockSessionLauncher.launch).toHaveBeenCalledTimes(2);
    });

    it('should not launch when user cancels prompt', async () => {
      (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 2 });

      await service.handleRun(url({ project: '/Users/me/new', provider: 'claude' }));

      expect(mockSessionLauncher.launch).not.toHaveBeenCalled();
    });

    it('should reject unknown provider', async () => {
      mockPluginRegistry.isValidMode.mockReturnValue(false);

      await service.handleRun(url({ project: '/Users/me/proj', provider: 'bogus' }));

      expect(mockSessionLauncher.launch).not.toHaveBeenCalled();
    });

    it('should reject relative project path', async () => {
      await service.handleRun(url({ project: 'relative/path', provider: 'claude' }));

      expect(mockSessionLauncher.launch).not.toHaveBeenCalled();
    });

    it('should reject session name exceeding max length', async () => {
      await service.handleRun(
        url({
          project: '/Users/me/proj',
          provider: 'claude',
          name: 'x'.repeat(300),
        })
      );

      expect(mockSessionLauncher.launch).not.toHaveBeenCalled();
    });

    it('should reject when required params are missing', async () => {
      await service.handleRun('omniscribe://run?provider=claude');
      await service.handleRun('omniscribe://run?project=/Users/me/proj');

      expect(mockSessionLauncher.launch).not.toHaveBeenCalled();
    });

    it('should ignore non-omniscribe URLs', async () => {
      await service.handleRun('https://example.com/run?project=/x&provider=claude');

      expect(mockSessionLauncher.launch).not.toHaveBeenCalled();
    });

    it('should add a tab for an unknown project before launching', async () => {
      (dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 });

      await service.handleRun(url({ project: '/Users/me/new', provider: 'claude' }));

      expect(mockWorkspaceService.addTab).toHaveBeenCalledWith(
        expect.objectContaining({
          projectPath: '/Users/me/new',
          name: 'new',
          isActive: true,
          sessionIds: [],
        })
      );
    });

    it('should pass branch and name through to launcher', async () => {
      mockWorkspaceService.getTabs.mockReturnValue([
        {
          id: 't1',
          projectPath: '/Users/me/proj',
          name: 'proj',
          sessionIds: [],
          isActive: true,
          lastAccessedAt: '2024-01-01',
        },
      ]);

      await service.handleRun(
        url({
          project: '/Users/me/proj',
          provider: 'claude',
          branch: 'feature-x',
          name: 'Stream Deck launch',
        })
      );

      expect(mockSessionLauncher.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'claude',
          branch: 'feature-x',
          name: 'Stream Deck launch',
        })
      );
    });
  });
});
