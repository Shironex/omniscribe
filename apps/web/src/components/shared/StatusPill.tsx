import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tone variants for the status pill. Mirrors the tone keys used by
 * `SettingsCard` so per-section accents stay coherent across the
 * settings surface.
 */
export type StatusPillTone = 'ready' | 'active' | 'warning' | 'error' | 'idle' | 'info';

interface StatusPillProps {
  tone?: StatusPillTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}

const TONE_STYLES: Record<StatusPillTone, string> = {
  ready: 'text-primary bg-primary/10',
  active: 'text-primary bg-primary/10',
  warning: 'text-status-warning bg-status-warning-bg',
  error: 'text-status-error bg-status-error-bg',
  idle: 'text-muted-foreground bg-muted',
  info: 'text-[oklch(0.8_0.13_210)] bg-[oklch(0.8_0.13_210/0.14)]',
};

/**
 * Compact status pill used in settings card headers and list rows.
 * Replaces the inline `text-xs font-medium px-2 py-1 rounded-full …`
 * pattern duplicated across MCP/GitHub/Claude/AiCapabilities sections.
 */
export function StatusPill({ tone = 'idle', icon: Icon, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium',
        TONE_STYLES[tone],
        className
      )}
    >
      {Icon && <Icon className="w-3 h-3" aria-hidden="true" />}
      {children}
    </span>
  );
}
