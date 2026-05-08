import * as path from 'path';
import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { SessionService } from '../session';
import { WorkspaceService } from '../workspace';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@omniscribe/shared';

// ---------------------------------------------------------------------------
// Electron mock
// jest.mock() factories are hoisted to the top of the file by Babel/ts-jest,
// so we cannot reference module-level variables declared with const/let.
// Capture references via the require() approach inside a beforeEach instead.
// ---------------------------------------------------------------------------

jest.mock('electron', () => {
  const notificationInstance = { show: jest.fn(), on: jest.fn() };
  const Notification = jest.fn().mockReturnValue(notificationInstance);
  (Notification as unknown as Record<string, unknown>).isSupported = () => true;
  return { Notification };
});

// The notification service imports mainWindow from the main process entry
// point, which drags in the entire Electron bootstrap. Mock it out.
jest.mock('../../main/index', () => ({ mainWindow: null }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkspaceService() {
  return {
    getPreferences: jest.fn().mockReturnValue({
      notifications: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        enabled: true,
        sound: true,
        onlyWhenUnfocused: false,
        events: {
          sessionCompleted: true,
          sessionNeedsInput: true,
          sessionError: true,
          zombieDetected: true,
          updateAvailable: true,
          updateDownloaded: true,
        },
      },
    }),
    getTabs: jest.fn().mockReturnValue([]),
  } as unknown as jest.Mocked<WorkspaceService>;
}

function makeSessionService() {
  return {
    get: jest.fn(),
    getAll: jest.fn().mockReturnValue([]),
  } as unknown as jest.Mocked<SessionService>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  let service: NotificationService;

  let MockNotification: jest.Mock;

  beforeEach(async () => {
    // Re-require the mocked module each test so we get fresh references.

    const electronMock = require('electron') as { Notification: jest.Mock };
    MockNotification = electronMock.Notification;
    MockNotification.mockClear();
    (MockNotification.mock.results[0]?.value?.show as jest.Mock | undefined)?.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: SessionService, useValue: makeSessionService() },
        { provide: WorkspaceService, useValue: makeWorkspaceService() },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  // -------------------------------------------------------------------------
  // showTestNotification
  // -------------------------------------------------------------------------
  describe('showTestNotification', () => {
    it('passes appID to native Notification so Windows toast resolves correct AUMID', () => {
      service.showTestNotification();

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({ appID: 'com.omniscribe.desktop' })
      );
    });

    it('calls show() on the constructed Notification', () => {
      service.showTestNotification();

      const instance = MockNotification.mock.results[0].value as { show: jest.Mock };
      expect(instance.show).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // showNativeNotification (production path — exercised via showUpdateAvailable)
  // -------------------------------------------------------------------------
  describe('showNativeNotification (via showUpdateAvailable)', () => {
    it('passes appID to native Notification for production notifications', () => {
      jest.useFakeTimers();
      service.showUpdateAvailable('1.2.3');
      jest.runAllTimers();
      jest.useRealTimers();

      expect(MockNotification).toHaveBeenCalledWith(
        expect.objectContaining({ appID: 'com.omniscribe.desktop' })
      );
    });
  });

  // -------------------------------------------------------------------------
  // main/index.ts ordering invariant (static analysis)
  // -------------------------------------------------------------------------
  describe('main/index.ts ordering invariant', () => {
    it('sets AppUserModelId before registering the protocol client', () => {
      const src = fs.readFileSync(path.join(__dirname, '../../main/index.ts'), 'utf8');
      const lines = src.split('\n');
      const aumidLine = lines.findIndex(l => l.includes('setAppUserModelId'));
      const protoLine = lines.findIndex(l => l.includes('setAsDefaultProtocolClient'));

      expect(aumidLine).toBeGreaterThanOrEqual(0);
      expect(protoLine).toBeGreaterThan(aumidLine);
    });
  });
});
