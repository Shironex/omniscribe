import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import {
  useMcpCapabilitiesStore,
  selectMcpCapabilities,
  selectMcpCapabilitiesLoading,
  selectMcpCapabilitiesError,
} from '@/stores/useMcpCapabilitiesStore';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';

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

  // Cancel any pending debounced commit if the project or capability
  // identity changes — otherwise the stale closure would commit the new
  // input value against the old projectPath/capabilityId.
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [projectPath, capabilityId]);

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
    <SettingsRow stacked divider>
      <SettingsRowLabel
        title="CDP port"
        description={
          <span>
            Launch your Electron app with{' '}
            <code className="rounded bg-muted/50 px-1 py-0.5 text-[11px]">
              --remote-debugging-port={value || port}
            </code>
          </span>
        }
      />
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
        aria-label="Chrome DevTools Protocol port"
      />
    </SettingsRow>
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
    <div className="space-y-4">
      <SettingsCard
        icon={Sparkles}
        tone="primary"
        title="AI Capabilities"
        subtitle="Enable optional MCP-powered tools for the active project."
      >
        {!projectPath && (
          <div className="text-center text-muted-foreground py-6">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Open a project to manage its AI capabilities.</p>
          </div>
        )}

        {projectPath && isLoading && capabilities.length === 0 && (
          <div className="flex items-center justify-center gap-3 text-muted-foreground py-6">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading capabilities...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-status-error/40 bg-status-error-bg/30 p-3 text-xs text-status-error">
            {error}
          </div>
        )}

        {projectPath &&
          capabilities.length > 0 &&
          capabilities.map((cap, index) => {
            // Allow disabling an already-enabled capability even when the
            // preflight now reports it unavailable — otherwise users get
            // stuck with a permanently-on toggle.
            const unavailable = Boolean(cap.disabledReason) && !cap.enabled;
            const isElectron = cap.id === 'playwright-electron';
            const description = (
              <span className="block space-y-0.5">
                <span className="block">{cap.description}</span>
                {cap.disabledReason ? (
                  <span className="block text-status-warning/90">{cap.disabledReason}</span>
                ) : (
                  <span className="block text-muted-foreground/70">
                    Takes effect on the next session you start.
                  </span>
                )}
              </span>
            );

            return (
              <div key={cap.id} className={cn(unavailable && 'opacity-70')}>
                <SettingsToggleRow
                  divider={index > 0}
                  title={
                    <span className="flex items-center gap-2">
                      <span>{cap.label}</span>
                      {cap.requiresDev && (
                        <span className="text-[10px] font-medium text-status-warning bg-status-warning-bg px-1.5 py-0.5 rounded">
                          Dev only
                        </span>
                      )}
                    </span>
                  }
                  description={description}
                  checked={cap.enabled}
                  disabled={disabledAll || unavailable}
                  onCheckedChange={next => {
                    if (projectPath) {
                      void toggleCapability(projectPath, cap.id, next);
                    }
                  }}
                />
                {isElectron && cap.enabled && projectPath && (
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

        {projectPath && !isLoading && capabilities.length === 0 && !error && (
          <div className="text-center text-muted-foreground py-6">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No capabilities registered.</p>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
