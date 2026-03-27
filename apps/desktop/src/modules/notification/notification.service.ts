import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Notification } from 'electron';
import {
  createLogger,
  DEFAULT_NOTIFICATION_SETTINGS,
  type SessionStatus,
  type SessionStatusUpdate,
  type NotificationSettings,
} from '@omniscribe/shared';
import { mainWindow } from '../../main/index';
import { SessionService } from '../session';
import { WorkspaceService } from '../workspace';
import {
  InternalSessionEvents,
  InternalZombieEvents,
  InternalUpdaterEvents,
} from '../shared/events';
import {
  DEBOUNCE_WINDOW_MS,
  RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  MAX_BODY_BYTES,
  type NotificationEventType,
} from './notification.constants';

interface ZombieCleanupPayload {
  sessionId: string;
  sessionName: string;
  reason: string;
}

interface PendingNotification {
  title: string;
  body: string;
  eventType: NotificationEventType;
  sessionId?: string;
  tabId?: string;
}

/** Statuses that trigger notifications */
const NOTIFIABLE_STATUSES: Partial<Record<SessionStatus, NotificationEventType>> = {
  finished: 'sessionCompleted',
  needs_input: 'sessionNeedsInput',
  error: 'sessionError',
};

@Injectable()
export class NotificationService implements OnModuleDestroy {
  private readonly logger = createLogger('NotificationService');

  /** Timestamps of recent notifications for rate limiting */
  private readonly recentTimestamps: number[] = [];

  /** Pending notifications in the debounce window */
  private pendingNotifications: PendingNotification[] = [];

  /** Debounce timer handle */
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly sessionService: SessionService,
    private readonly workspaceService: WorkspaceService
  ) {}

  onModuleDestroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Listen to session status changes and trigger notifications for
   * interesting transitions (finished, needs_input, error).
   */
  @OnEvent(InternalSessionEvents.STATUS)
  onSessionStatus(payload: SessionStatusUpdate): void {
    const eventType = NOTIFIABLE_STATUSES[payload.status];
    if (!eventType) return;

    const session = this.sessionService.get(payload.sessionId);
    if (!session) return;

    const projectName = this.extractProjectName(session.projectPath);
    const sessionName = session.name;

    let title: string;
    let body: string;

    switch (payload.status) {
      case 'needs_input':
        title = 'Session needs your input';
        body = `${projectName} — "${sessionName}"`;
        break;
      case 'finished':
        title = 'Session completed';
        body = `${projectName} — "${sessionName}" finished successfully`;
        break;
      case 'error':
        title = 'Session error';
        body = `${projectName} — "${sessionName}" encountered an error`;
        break;
      default:
        return;
    }

    // Find the tab ID for this session's project
    const tabId = this.findTabIdForProject(session.projectPath);

    this.enqueueNotification({
      title,
      body,
      eventType,
      sessionId: payload.sessionId,
      tabId: tabId ?? undefined,
    });
  }

  /**
   * Listen to zombie cleanup events.
   */
  @OnEvent(InternalZombieEvents.CLEANUP)
  onZombieCleanup(payload: ZombieCleanupPayload): void {
    this.enqueueNotification({
      title: 'Zombie session cleaned up',
      body: `Cleaned up unresponsive session "${payload.sessionName}"`,
      eventType: 'zombieDetected',
      sessionId: payload.sessionId,
    });
  }

  /**
   * Listen to update-available events from the auto-updater.
   */
  @OnEvent(InternalUpdaterEvents.UPDATE_AVAILABLE)
  onUpdateAvailable(payload: { version: string }): void {
    this.showUpdateAvailable(payload.version);
  }

  /**
   * Listen to update-downloaded events from the auto-updater.
   */
  @OnEvent(InternalUpdaterEvents.UPDATE_DOWNLOADED)
  onUpdateDownloaded(payload: { version: string }): void {
    this.showUpdateDownloaded(payload.version);
  }

  /**
   * Show an update-available notification.
   */
  showUpdateAvailable(version: string): void {
    this.enqueueNotification({
      title: 'Update available',
      body: `Omniscribe v${version} is ready to download`,
      eventType: 'updateAvailable',
    });
  }

  /**
   * Show an update-downloaded notification.
   * Called from the updater integration.
   */
  showUpdateDownloaded(version: string): void {
    this.enqueueNotification({
      title: 'Update ready to install',
      body: `Omniscribe v${version} is ready — restart to install`,
      eventType: 'updateDownloaded',
    });
  }

  /**
   * Show a test notification (triggered from settings UI).
   */
  showTestNotification(): void {
    if (!Notification.isSupported()) {
      this.logger.warn('Notifications not supported on this platform');
      return;
    }

    const notification = new Notification({
      title: 'Omniscribe Test Notification',
      body: 'Notifications are working correctly!',
      silent: false,
    });

    notification.show();
  }

  private enqueueNotification(notification: PendingNotification): void {
    const settings = this.getSettings();
    if (!settings.enabled) return;
    if (!settings.events[notification.eventType]) return;
    if (settings.onlyWhenUnfocused && this.isWindowFocused()) return;

    this.pendingNotifications.push(notification);

    // If no debounce timer is running, start one
    if (!this.debounceTimer) {
      this.debounceTimer = setTimeout(() => {
        this.flushPendingNotifications();
      }, DEBOUNCE_WINDOW_MS);
    }
  }

  private flushPendingNotifications(): void {
    this.debounceTimer = null;

    const notifications = this.pendingNotifications;
    this.pendingNotifications = [];

    if (notifications.length === 0) return;

    // Re-check focus state — window may have been focused during debounce
    const settings = this.getSettings();
    if (settings.onlyWhenUnfocused && this.isWindowFocused()) return;

    // Rate limit check
    const now = Date.now();
    this.pruneRateLimit(now);

    const remaining = RATE_LIMIT_PER_MINUTE - this.recentTimestamps.length;
    if (remaining <= 0) {
      // Rate limit reached — still show a summary so notifications aren't silently lost
      this.logger.debug('Rate limit reached, showing summary');
      const summary = this.buildBatchSummary(notifications);
      this.showNativeNotification(summary, settings);
      return;
    }

    if (notifications.length === 1) {
      this.showNativeNotification(notifications[0], settings);
    } else {
      // Batch all pending notifications into a single summary
      const summary = this.buildBatchSummary(notifications);
      this.showNativeNotification(summary, settings);
    }
  }

  private showNativeNotification(
    notification: PendingNotification,
    settings: NotificationSettings
  ): void {
    if (!Notification.isSupported()) {
      this.logger.warn('Notifications not supported on this platform');
      return;
    }

    const body = this.truncateBody(notification.body);

    const native = new Notification({
      title: notification.title,
      body,
      silent: !settings.sound,
    });

    native.on('click', () => {
      this.handleNotificationClick(notification.sessionId, notification.tabId);
    });

    native.show();
    this.recentTimestamps.push(Date.now());
  }

  private handleNotificationClick(sessionId?: string, tabId?: string): void {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    // Focus the window
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    // On Windows, force focus with setAlwaysOnTop workaround
    if (process.platform === 'win32') {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setAlwaysOnTop(false);
    }

    // Send navigation IPC to renderer if we have a target
    if (sessionId || tabId) {
      mainWindow.webContents.send('notification:navigate', { sessionId, tabId });
    }
  }

  private buildBatchSummary(notifications: PendingNotification[]): PendingNotification {
    const count = notifications.length;
    const types = new Set(notifications.map(n => n.eventType));

    let title: string;
    if (types.size === 1) {
      const type = [...types][0];
      title = `${count} session ${type === 'sessionCompleted' ? 'completions' : type === 'sessionNeedsInput' ? 'inputs needed' : 'events'}`;
    } else {
      title = `${count} notifications`;
    }

    const body = notifications
      .slice(0, 3)
      .map(n => n.body)
      .join('\n');

    // Navigate to the most recent notification's session on click
    const last = notifications[notifications.length - 1];

    return {
      title,
      body: count > 3 ? `${body}\n...and ${count - 3} more` : body,
      eventType: notifications[0].eventType,
      sessionId: last.sessionId,
      tabId: last.tabId,
    };
  }

  private getSettings(): NotificationSettings {
    const preferences = this.workspaceService.getPreferences();
    return (preferences.notifications as NotificationSettings) ?? DEFAULT_NOTIFICATION_SETTINGS;
  }

  private isWindowFocused(): boolean {
    return mainWindow !== null && !mainWindow.isDestroyed() && mainWindow.isFocused();
  }

  private extractProjectName(projectPath: string): string {
    const parts = projectPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || projectPath;
  }

  private findTabIdForProject(projectPath: string): string | null {
    const tabs = this.workspaceService.getTabs();
    const tab = tabs.find(t => t.projectPath === projectPath);
    return tab?.id ?? null;
  }

  private truncateBody(body: string): string {
    // Use byte length for macOS 256-byte limit (multi-byte chars like emoji)
    const encoder = new TextEncoder();
    if (encoder.encode(body).length <= MAX_BODY_BYTES) return body;

    // Binary search for the longest prefix that fits within the byte limit
    let lo = 0;
    let hi = body.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (encoder.encode(body.slice(0, mid) + '...').length <= MAX_BODY_BYTES) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return body.slice(0, lo) + '...';
  }

  private pruneRateLimit(now: number): void {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    const firstValid = this.recentTimestamps.findIndex(t => t >= cutoff);
    if (firstValid === -1) {
      this.recentTimestamps.length = 0;
    } else if (firstValid > 0) {
      this.recentTimestamps.splice(0, firstValid);
    }
  }
}
