import { useEffect, useState } from 'react';
import { Check, Save } from 'lucide-react';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';

const SECTION_LABELS: Record<string, string> = {
  github: 'GitHub CLI',
  mcp: 'MCP servers',
  'ai-capabilities': 'AI capabilities',
  marketplace: 'Extensions',
  sessions: 'Sessions',
  quickActions: 'Quick actions',
  worktrees: 'Worktrees',
  notifications: 'Notifications',
  appearance: 'Appearance',
  terminal: 'Terminal',
  general: 'About',
};

function formatRelative(ms: number | null, now: number): string {
  if (!ms) return 'No changes yet';
  const delta = Math.max(0, Math.floor((now - ms) / 1000));
  if (delta < 5) return 'Saved just now';
  if (delta < 60) return `Saved ${delta}s ago`;
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `Saved ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `Saved ${hours}h ago`;
}

/**
 * Bottom status strip rendered inside the Settings view. Mirrors the
 * "Settings · {section}" left / "Saved Ns ago" right pattern from the
 * design mock. Tracks `lastSavedAt` from the settings store and ticks
 * once per second so the relative time stays fresh.
 */
export function SettingsStatusBar() {
  const { activeSection, lastSavedAt, showStatusBar } = useSettingsStore(
    useShallow(state => ({
      activeSection: state.activeSection,
      lastSavedAt: state.lastSavedAt,
      showStatusBar: state.chrome.showStatusBar,
    }))
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!showStatusBar) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [showStatusBar]);

  if (!showStatusBar) return null;

  const label = SECTION_LABELS[activeSection] ?? activeSection;

  return (
    <footer
      role="status"
      className="flex items-center justify-between gap-4 px-6 py-2 border-t border-border-glass/60 bg-background/40 backdrop-blur-sm text-[11px] text-muted-foreground"
    >
      <span className="flex items-center gap-1.5 font-mono uppercase tracking-[0.14em]">
        <Save className="w-3 h-3" aria-hidden="true" />
        Settings <span className="text-muted-foreground/60">·</span>{' '}
        <span className="text-foreground/85 normal-case tracking-normal font-sans">{label}</span>
      </span>
      <span className="flex items-center gap-1.5 tabular-nums">
        <Check className="w-3 h-3 text-status-success" aria-hidden="true" />
        {formatRelative(lastSavedAt, now)}
      </span>
    </footer>
  );
}
