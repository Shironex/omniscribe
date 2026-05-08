import { Bell, MessageSquare } from 'lucide-react';
import { APP_NAME } from '@omniscribe/shared';

/**
 * Fake desktop-toast preview that illustrates how an Omniscribe
 * notification appears when a session needs input. Mirrors
 * shiroani's `DiscordPreview` editorial card styling.
 */
export function NotificationPreview() {
  return (
    <div className="rounded-lg border border-border-glass bg-[#1f1f23] p-3.5 text-white/90 font-sans shadow-lg">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/20 border border-primary/30 grid place-items-center shrink-0">
          <Bell className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50 truncate">
              {APP_NAME}
            </p>
            <span className="text-[10px] text-white/40">now</span>
          </div>
          <p className="mt-0.5 text-sm font-semibold text-white truncate">Session needs input</p>
          <p className="mt-0.5 text-xs text-white/70 leading-snug">
            <span className="text-white/90 font-medium">Claude</span> is asking a question in{' '}
            <span className="text-white/90 font-medium">apps/web</span>.
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80">
            <MessageSquare className="w-3 h-3" />
            Click to focus session
          </div>
        </div>
      </div>
    </div>
  );
}
