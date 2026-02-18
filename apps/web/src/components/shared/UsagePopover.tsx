import type { ComponentType } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { usePluginStore } from '@/stores/usePluginStore';
import { PluginErrorBoundary } from '@/components/plugin/PluginErrorBoundary';

// ─── No usage fallback ─────────────────────────────────────────────────────

function NoUsageFallback() {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-2 px-2 hover:bg-accent">
              <Activity className="w-4 h-4 text-muted-foreground" size={16} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Usage</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-[280px] p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 bg-secondary/10">
          <Activity className="w-4 h-4 text-muted-foreground" size={16} />
          <span className="text-sm font-semibold">Usage</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center space-y-2">
          <Activity className="w-8 h-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            Usage data not available for this provider
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main UsagePopover (pure delegator) ──────────────────────────────────────

/**
 * Provider-agnostic usage popover.
 * Delegates to the plugin-registered usage panel for the active session's AI mode.
 * Falls back to a generic "not available" message if no panel is registered.
 */
export function UsagePopover() {
  // Get active session's aiMode
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const tabs = useWorkspaceStore(s => s.tabs);
  const sessions = useSessionStore(s => s.sessions);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeSession = activeTab
    ? sessions.find(s => s.projectPath === activeTab.projectPath)
    : undefined;
  const aiMode = activeSession?.aiMode ?? 'claude'; // default to claude for backward compat

  // Check for plugin-registered usage panel
  const usagePanelReg = usePluginStore(s => {
    for (const [, reg] of s.usagePanels) {
      if (reg.aiMode === aiMode) return reg;
    }
    return undefined;
  });

  const projectPath = activeTab?.projectPath;

  // If plugin panel registered, delegate to it
  if (usagePanelReg) {
    const PanelComponent = usagePanelReg.component as ComponentType<{ workingDir: string }>;
    return (
      <PluginErrorBoundary pluginId={usagePanelReg.pluginId}>
        <PanelComponent workingDir={projectPath ?? ''} />
      </PluginErrorBoundary>
    );
  }

  // No usage panel registered for this provider
  return <NoUsageFallback />;
}
