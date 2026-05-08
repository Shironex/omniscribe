import { Monitor, Plus } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { getModeIcon, buildAiModeOptions } from '@/lib/ai-mode-utils';
import type { SessionSettings } from '@omniscribe/shared';
import { DEFAULT_SESSION_SETTINGS } from '@omniscribe/shared';

/**
 * Stack of three faux session slots, each labeled with the user's chosen
 * default mode. The same icon used by the radio list is reused so the
 * preview literally shows what gets dropped into the new-session row when
 * the user clicks "+ Add session".
 */
export function SessionsPreview() {
  const preferences = useWorkspaceStore(state => state.preferences);
  const providers = usePluginStore(s => s.providers);
  const statusRenderers = usePluginStore(s => s.statusRenderers);

  const sessionSettings: SessionSettings = preferences.session ?? DEFAULT_SESSION_SETTINGS;
  const mode = sessionSettings.defaultMode;

  const options = buildAiModeOptions(providers, statusRenderers);
  const active = options.find(opt => opt.value === mode);
  const ModeIcon = getModeIcon(mode, statusRenderers, Monitor);
  const modeLabel = mode === 'plain' ? 'Plain Terminal' : (active?.label ?? mode);

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-3 space-y-1.5">
      {/* Two existing slots — clearly "filled" */}
      {[0, 1].map(idx => (
        <div
          key={idx}
          className="flex items-center gap-2.5 rounded-md border border-border-glass/60 bg-card/40 px-2.5 py-1.5"
        >
          <span
            className="size-1.5 rounded-full bg-status-success/70 shrink-0"
            aria-hidden="true"
          />
          <ModeIcon className="w-3.5 h-3.5 text-primary shrink-0" size={14} />
          <span className="text-[12px] font-medium text-foreground truncate">{modeLabel}</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
            slot {idx + 1}
          </span>
        </div>
      ))}
      {/* Empty "next slot" — what would land here when user clicks add */}
      <div className="flex items-center gap-2.5 rounded-md border border-dashed border-primary/30 bg-primary/[0.04] px-2.5 py-1.5">
        <Plus className="w-3.5 h-3.5 text-primary/70 shrink-0" />
        <ModeIcon className="w-3.5 h-3.5 text-primary/80 shrink-0" size={14} />
        <span className="text-[12px] font-medium text-primary/90 truncate">
          New session — {modeLabel}
        </span>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-primary/60">
          default
        </span>
      </div>
    </div>
  );
}
