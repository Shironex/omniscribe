import { useEffect, useState, useRef } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import {
  useMcpCapabilitiesStore,
  selectMcpCapabilities,
  selectMcpCapabilitiesLoading,
  selectMcpCapabilitiesError,
} from '@/stores/useMcpCapabilitiesStore';

/**
 * Debounced numeric port input for the playwright-electron capability.
 * Commits on blur (or 800ms after the last edit) and clamps the value to
 * a valid TCP port range before emitting.
 */
function ElectronCdpPortField({
  projectPath,
  capabilityId,
  port,
  onCommit,
}: {
  projectPath: string;
  capabilityId: string;
  port: number;
  onCommit: (projectPath: string, id: string, port: number) => Promise<void>;
}) {
  const [value, setValue] = useState<string>(String(port));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect external port updates (e.g. server broadcast, project switch).
  useEffect(() => {
    setValue(String(port));
  }, [port]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65535) {
      // Invalid — snap the input back to the last known-good value.
      setValue(String(port));
      return;
    }
    if (parsed === port) return;
    void onCommit(projectPath, capabilityId, parsed);
  };

  const scheduleCommit = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(raw), 800);
  };

  return (
    <div className="mt-3 flex items-center gap-3">
      <label className="text-xs font-medium text-muted-foreground shrink-0" htmlFor="cdp-port">
        CDP port
      </label>
      <Input
        id="cdp-port"
        type="number"
        min={1024}
        max={65535}
        value={value}
        onChange={e => {
          setValue(e.target.value);
          scheduleCommit(e.target.value);
        }}
        onBlur={() => {
          if (timer.current) {
            clearTimeout(timer.current);
            timer.current = null;
          }
          commit(value);
        }}
        className="h-8 w-28 text-xs"
      />
      <span className="text-xs text-muted-foreground/80">
        Launch your Electron app with{' '}
        <code className="rounded bg-muted/50 px-1 py-0.5 text-[11px]">
          --remote-debugging-port={value || port}
        </code>
      </span>
    </div>
  );
}

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
  const setElectronCdpPort = useMcpCapabilitiesStore(state => state.setElectronCdpPort);

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
            const isElectron = cap.id === 'playwright-electron';
            return (
              <div
                key={cap.id}
                className={cn(
                  'rounded-xl border border-border/50 bg-card/50 p-4',
                  unavailable && 'opacity-70'
                )}
              >
                <div className="flex items-start gap-4">
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
                {isElectron && projectPath && (
                  <ElectronCdpPortField
                    projectPath={projectPath}
                    capabilityId={cap.id}
                    port={cap.electronCdpPort ?? 9222}
                    onCommit={setElectronCdpPort}
                  />
                )}
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
