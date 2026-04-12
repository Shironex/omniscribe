import { useEffect } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Switch } from '@/components/ui/switch';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import {
  useMcpCapabilitiesStore,
  selectMcpCapabilities,
  selectMcpCapabilitiesLoading,
  selectMcpCapabilitiesError,
} from '@/stores/useMcpCapabilitiesStore';

/**
 * Per-project AI Capabilities settings.
 *
 * Lists registered MCP capabilities (e.g. Omniscribe Status, Playwright)
 * and lets the user enable/disable each one for the active project.
 * Changes apply to subsequently launched sessions.
 */
export function AiCapabilitiesSection() {
  const activeTab = useWorkspaceStore(selectActiveTab);
  const projectPath = activeTab?.projectPath ?? null;

  const capabilities = useMcpCapabilitiesStore(selectMcpCapabilities);
  const isLoading = useMcpCapabilitiesStore(selectMcpCapabilitiesLoading);
  const error = useMcpCapabilitiesStore(selectMcpCapabilitiesError);
  const fetchCapabilities = useMcpCapabilitiesStore(state => state.fetchCapabilities);
  const toggleCapability = useMcpCapabilitiesStore(state => state.toggleCapability);

  useEffect(() => {
    if (projectPath) {
      fetchCapabilities(projectPath);
    }
  }, [projectPath, fetchCapabilities]);

  const disabledAll = !projectPath || isLoading || capabilities.length === 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Sparkles}
        title="AI Capabilities"
        description="Enable optional MCP-powered tools for the active project"
      />

      {!projectPath && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6 text-center text-muted-foreground">
          <p className="text-sm">Open a project to manage its AI capabilities.</p>
        </div>
      )}

      {projectPath && isLoading && capabilities.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading capabilities...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-status-error/40 bg-status-error-bg/30 p-3 text-xs text-status-error">
          {error}
        </div>
      )}

      {projectPath && capabilities.length > 0 && (
        <div className="space-y-3">
          {capabilities.map(cap => {
            // Allow disabling an already-enabled capability even when the
            // preflight now reports it unavailable — otherwise users get
            // stuck with a permanently-on toggle.
            const unavailable = Boolean(cap.disabledReason) && !cap.enabled;
            return (
              <div
                key={cap.id}
                className={cn(
                  'rounded-xl border border-border/50 bg-card/50 p-4',
                  'flex items-start gap-4',
                  unavailable && 'opacity-70'
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground truncate">{cap.label}</h3>
                    {cap.requiresDev && (
                      <span className="text-[10px] font-medium text-status-warning bg-status-warning-bg px-1.5 py-0.5 rounded">
                        Dev only
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{cap.description}</p>
                  {cap.disabledReason ? (
                    <p className="text-xs text-status-warning/90 mt-1.5">{cap.disabledReason}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground/70 mt-1.5">
                      Applies to new sessions.
                    </p>
                  )}
                </div>
                <Switch
                  checked={cap.enabled}
                  disabled={disabledAll || unavailable}
                  onCheckedChange={next => {
                    if (projectPath) {
                      void toggleCapability(projectPath, cap.id, next);
                    }
                  }}
                  aria-label={`Toggle ${cap.label}`}
                />
              </div>
            );
          })}
        </div>
      )}

      {projectPath && !isLoading && capabilities.length === 0 && !error && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6 text-center text-muted-foreground">
          <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No capabilities registered.</p>
        </div>
      )}
    </div>
  );
}
