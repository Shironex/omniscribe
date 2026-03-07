import { type ComponentType, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Activity } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/useWorkspaceStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { usePluginStore, type ProviderInfo } from '@/stores/usePluginStore';
import { PluginErrorBoundary } from '@/components/plugin/PluginErrorBoundary';
import type { UsagePanelProps, UsagePanelRegistration } from '@omniscribe/plugin-api';

type WithPluginId<T> = T & { pluginId: string };

interface ResolvedPanel {
  aiMode: string;
  registration: WithPluginId<UsagePanelRegistration>;
  provider: ProviderInfo | undefined;
}

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

// ─── Multi-provider tabbed popover ─────────────────────────────────────────

function MultiProviderPopover({
  panels,
  projectPath,
}: {
  panels: ResolvedPanel[];
  projectPath: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-2 px-2 hover:bg-accent">
              <Activity className="w-4 h-4 text-muted-foreground" size={16} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        {!open && <TooltipContent side="bottom">Usage</TooltipContent>}
      </Tooltip>
      <PopoverContent
        className="w-[340px] p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border shadow-2xl"
        align="end"
        sideOffset={8}
      >
        <Tabs defaultValue={panels[0].aiMode}>
          <div className="px-3 pt-3 pb-0">
            <TabsList className="w-full">
              {panels.map(({ aiMode, registration }) => {
                const Icon = registration.icon as
                  | ComponentType<{ size?: number; className?: string }>
                  | undefined;
                const label =
                  registration.label ?? aiMode.charAt(0).toUpperCase() + aiMode.slice(1);
                return (
                  <TabsTrigger key={aiMode} value={aiMode} className="flex-1 gap-1.5 text-xs">
                    {Icon && <Icon size={14} />}
                    {label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>
          {panels.map(({ aiMode, registration }) => {
            const PanelComponent = registration.component as ComponentType<UsagePanelProps>;
            return (
              <TabsContent key={aiMode} value={aiMode} className="mt-0">
                <PluginErrorBoundary pluginId={registration.pluginId}>
                  <PanelComponent workingDir={projectPath} embedded />
                </PluginErrorBoundary>
              </TabsContent>
            );
          })}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main UsagePopover ─────────────────────────────────────────────────────

/**
 * Provider-agnostic usage popover.
 *
 * Resolves all active providers for the current tab:
 * - 0 providers: "not available" fallback
 * - 1 provider: renders the panel standalone (own Popover, same UX as before)
 * - 2+ providers: renders a single Popover with tabbed content per provider
 */
export function UsagePopover() {
  const activeTabId = useWorkspaceStore(s => s.activeTabId);
  const tabs = useWorkspaceStore(s => s.tabs);
  const sessions = useSessionStore(s => s.sessions);
  const usagePanels = usePluginStore(s => s.usagePanels);
  const providers = usePluginStore(s => s.providers);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const projectPath = activeTab?.projectPath ?? '';

  // Resolve all distinct aiModes from the active tab's sessions
  const resolvedPanels = useMemo((): ResolvedPanel[] => {
    if (!activeTab) return [];

    // Get all sessions belonging to this tab
    const sessionIdSet = new Set(activeTab.sessionIds);
    const tabSessions = sessions.filter(s => sessionIdSet.has(s.id));

    // Backward compat: if no sessionIds match, fall back to projectPath lookup
    const relevantSessions =
      tabSessions.length > 0
        ? tabSessions
        : sessions.filter(s => s.projectPath === activeTab.projectPath);

    // Deduplicate by aiMode
    const modes = [...new Set(relevantSessions.map(s => s.aiMode))];

    // Look up registered usage panels for each mode
    const panels: ResolvedPanel[] = [];
    for (const mode of modes) {
      for (const [, reg] of usagePanels) {
        if (reg.aiMode === mode) {
          panels.push({
            aiMode: mode,
            registration: reg,
            provider: providers.find(p => p.aiMode === mode),
          });
          break;
        }
      }
    }

    return panels.toSorted((a, b) => (a.registration.order ?? 100) - (b.registration.order ?? 100));
  }, [activeTab, sessions, usagePanels, providers]);

  // No panels registered for any active provider
  if (resolvedPanels.length === 0) {
    return <NoUsageFallback />;
  }

  // Single provider: render standalone (panel manages its own Popover)
  if (resolvedPanels.length === 1) {
    const { registration } = resolvedPanels[0];
    const PanelComponent = registration.component as ComponentType<UsagePanelProps>;
    return (
      <PluginErrorBoundary pluginId={registration.pluginId}>
        <PanelComponent workingDir={projectPath} />
      </PluginErrorBoundary>
    );
  }

  // Multiple providers: tabbed popover
  return <MultiProviderPopover panels={resolvedPanels} projectPath={projectPath} />;
}
