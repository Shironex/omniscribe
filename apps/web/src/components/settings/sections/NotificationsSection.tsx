import { Bell, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import type { NotificationSettings } from '@omniscribe/shared';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@omniscribe/shared';

interface ToggleRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleRow({ id, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div id={`${id}-label`} className="text-sm font-medium text-foreground">
          {label}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors duration-200',
          checked ? 'bg-primary' : 'bg-border'
        )}
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
      >
        <div
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

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

  const update = (partial: Partial<NotificationSettings>) => {
    updatePreference('notifications', { ...settings, ...partial });
  };

  const updateEvent = (key: keyof NotificationSettings['events']) => {
    update({
      events: {
        ...settings.events,
        [key]: !settings.events[key],
      },
    });
  };

  const handleTestNotification = async () => {
    if (window.electronAPI?.notification) {
      await window.electronAPI.notification.sendTest();
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Bell}
        title="Notifications"
        description="Configure desktop notification preferences"
      />

      {/* Master Toggles */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-foreground">General</h3>

        <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
          <ToggleRow
            id="notifications-enabled"
            label="Enable desktop notifications"
            description="Show OS-level notifications for session events"
            checked={settings.enabled}
            onChange={() => update({ enabled: !settings.enabled })}
          />

          {settings.enabled && (
            <>
              <div className="border-t border-border/30" />
              <ToggleRow
                id="notifications-sound"
                label="Play sound"
                description="Play the system notification sound"
                checked={settings.sound}
                onChange={() => update({ sound: !settings.sound })}
              />

              <div className="border-t border-border/30" />
              <ToggleRow
                id="notifications-unfocused"
                label="Only when app is unfocused"
                description="Skip notifications when Omniscribe is in the foreground"
                checked={settings.onlyWhenUnfocused}
                onChange={() => update({ onlyWhenUnfocused: !settings.onlyWhenUnfocused })}
              />
            </>
          )}
        </div>
      </div>

      {/* Event Type Toggles */}
      {settings.enabled && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-foreground">Notify me when</h3>

          <div className="rounded-xl border border-border/50 bg-card/50 p-4 space-y-4">
            {EVENT_TOGGLES.map((toggle, index) => (
              <div key={toggle.key}>
                {index > 0 && <div className="border-t border-border/30" />}
                <ToggleRow
                  id={`notification-event-${toggle.key}`}
                  label={toggle.label}
                  description={toggle.description}
                  checked={settings.events[toggle.key]}
                  onChange={() => updateEvent(toggle.key)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Notification */}
      {settings.enabled && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleTestNotification}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
              'text-sm font-medium',
              'bg-primary/10 text-primary hover:bg-primary/20',
              'border border-primary/20',
              'transition-colors duration-200'
            )}
          >
            <Send className="w-4 h-4" />
            Send Test Notification
          </button>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
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
