import { Bell, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { NotificationSettings } from '@omniscribe/shared';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@omniscribe/shared';
import { SettingsCard, SettingsToggleRow } from '@/components/settings/SettingsCard';

const EVENT_TOGGLES: Array<{
  key: keyof NotificationSettings['events'];
  label: string;
  description: string;
}> = [
  {
    key: 'sessionNeedsInput',
    label: 'Session needs input',
    description: 'When a session is waiting for your response',
  },
  {
    key: 'sessionCompleted',
    label: 'Session completed',
    description: 'When a session finishes its task',
  },
  {
    key: 'sessionError',
    label: 'Session error',
    description: 'When a session encounters an error',
  },
  {
    key: 'zombieDetected',
    label: 'Zombie session cleanup',
    description: 'When an unresponsive session is cleaned up',
  },
  {
    key: 'updateAvailable',
    label: 'Update available',
    description: 'When a new version is ready to download',
  },
  {
    key: 'updateDownloaded',
    label: 'Update ready to install',
    description: 'When a downloaded update is ready',
  },
];

export function NotificationsSection() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const updatePreference = useWorkspaceStore(state => state.updatePreference);

  const settings: NotificationSettings = preferences.notifications ?? DEFAULT_NOTIFICATION_SETTINGS;

  // Read latest settings at call time to avoid stale-closure overwrites
  // when two toggles are clicked in quick succession.
  const getLatestSettings = (): NotificationSettings =>
    (useWorkspaceStore.getState().preferences.notifications as NotificationSettings) ??
    DEFAULT_NOTIFICATION_SETTINGS;

  const update = (partial: Partial<NotificationSettings>) => {
    updatePreference('notifications', { ...getLatestSettings(), ...partial });
  };

  const updateEvent = (key: keyof NotificationSettings['events']) => {
    const latest = getLatestSettings();
    updatePreference('notifications', {
      ...latest,
      events: {
        ...latest.events,
        [key]: !latest.events[key],
      },
    });
  };

  const handleTestNotification = async () => {
    if (window.electronAPI?.notification) {
      await window.electronAPI.notification.sendTest();
    }
  };

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Bell}
        tone="gold"
        title="Notifications"
        subtitle="Configure desktop notification preferences."
      >
        <SettingsToggleRow
          title="Enable desktop notifications"
          description="Show OS-level notifications for session events"
          checked={settings.enabled}
          onCheckedChange={value => update({ enabled: value })}
        />
        {settings.enabled && (
          <>
            <SettingsToggleRow
              divider
              title="Play sound"
              description="Play the system notification sound"
              checked={settings.sound}
              onCheckedChange={value => update({ sound: value })}
            />
            <SettingsToggleRow
              divider
              title="Only when app is unfocused"
              description="Skip notifications when Omniscribe is in the foreground"
              checked={settings.onlyWhenUnfocused}
              onCheckedChange={value => update({ onlyWhenUnfocused: value })}
            />
          </>
        )}
      </SettingsCard>

      {settings.enabled && (
        <SettingsCard
          icon={Bell}
          tone="muted"
          title="Notify me when"
          subtitle="Pick which events should fire a notification."
        >
          {EVENT_TOGGLES.map((toggle, index) => (
            <SettingsToggleRow
              key={toggle.key}
              divider={index > 0}
              title={toggle.label}
              description={toggle.description}
              checked={settings.events[toggle.key]}
              onCheckedChange={() => updateEvent(toggle.key)}
            />
          ))}
        </SettingsCard>
      )}

      {settings.enabled && (
        <button
          type="button"
          onClick={handleTestNotification}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
            'text-sm font-medium',
            'bg-primary/10 text-primary hover:bg-primary/20',
            'border border-primary/20',
            'transition-colors duration-200',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
          )}
        >
          <Send className="w-4 h-4" />
          Send Test Notification
        </button>
      )}

      <div className="rounded-xl border border-border-glass bg-muted/20 p-4">
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">How it works</strong>
          </p>
          <p>
            Desktop notifications alert you when sessions change status while the app is in the
            background. Click a notification to focus the app and navigate to the relevant session.
          </p>
          <p>
            Rapid events are batched (3-second window) and rate-limited (max 10/minute) to avoid
            notification spam.
          </p>
        </div>
      </div>
    </div>
  );
}
