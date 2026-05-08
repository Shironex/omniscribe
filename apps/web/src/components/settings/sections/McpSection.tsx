import { useCallback, useMemo, useEffect } from 'react';
import { Server, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MCP_SERVER_NAME } from '@omniscribe/shared';
import { useMcpStore, selectInternalMcp } from '@/stores/useMcpStore';
import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { StatusPill, type StatusPillTone } from '@/components/shared/StatusPill';

export function McpSection() {
  const servers = useMcpStore(state => state.servers);
  const serverStates = useMcpStore(state => state.serverStates);
  const isLoading = useMcpStore(state => state.isDiscovering);
  const discoverServers = useMcpStore(state => state.discoverServers);
  const internalMcp = useMcpStore(selectInternalMcp);

  const activeTab = useWorkspaceStore(selectActiveTab);

  useEffect(() => {
    if (activeTab?.projectPath) {
      discoverServers(activeTab.projectPath);
    }
  }, [activeTab?.projectPath, discoverServers]);

  const connectedCount = useMemo(() => {
    return Object.values(serverStates).filter(state => state.status === 'connected').length;
  }, [serverStates]);

  const handleRefresh = useCallback(() => {
    discoverServers(activeTab?.projectPath);
  }, [discoverServers, activeTab?.projectPath]);

  // Header summary pill: prefers "all active", falls back to "N active",
  // then "Ready" (configured but none active), then "None".
  const headerPill = (() => {
    if (servers.length === 0) {
      return <StatusPill tone="idle">None</StatusPill>;
    }
    if (connectedCount === servers.length) {
      return (
        <StatusPill tone="ready" icon={CheckCircle2}>
          All Active
        </StatusPill>
      );
    }
    if (connectedCount > 0) {
      return (
        <StatusPill tone="warning" icon={CheckCircle2}>
          {connectedCount} Active
        </StatusPill>
      );
    }
    return (
      <StatusPill tone="ready" icon={CheckCircle2}>
        Ready
      </StatusPill>
    );
  })();

  const refreshButton = (
    <button
      type="button"
      aria-label="Refresh MCP servers"
      onClick={handleRefresh}
      disabled={isLoading}
      className={cn(
        'p-2 rounded-lg transition-colors',
        'hover:bg-muted text-muted-foreground hover:text-foreground',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      )}
      title="Refresh servers"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        <RefreshCw className="w-4 h-4" />
      )}
    </button>
  );

  const subtitle = (
    <span>
      {servers.length} server{servers.length !== 1 ? 's' : ''} configured
      {connectedCount > 0 && `, ${connectedCount} active`}. Connections occur when a session starts.
    </span>
  );

  return (
    <div className="space-y-4">
      <SettingsCard
        icon={Server}
        tone="blue"
        title="MCP Servers"
        subtitle={subtitle}
        headerAccessory={
          <div className="flex items-center gap-2">
            {headerPill}
            {refreshButton}
          </div>
        }
      >
        {/* Internal MCP Status */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              internalMcp.available ? 'bg-primary' : 'bg-status-error'
            )}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-snug text-foreground">
              Internal MCP Server
            </p>
            <p className="text-[12px] text-muted-foreground/85 leading-snug truncate">
              {internalMcp.available
                ? internalMcp.path?.split(/[/\\]/).slice(-2).join('/')
                : 'Not available'}
            </p>
          </div>
          <StatusPill tone={internalMcp.available ? 'ready' : 'error'}>
            {internalMcp.available ? 'Ready' : 'Unavailable'}
          </StatusPill>
        </div>

        {/* Loading State */}
        {isLoading && servers.length === 0 && (
          <div className="border-t border-border-glass/60 pt-3.5 flex items-center justify-center gap-3 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading MCP servers...</span>
          </div>
        )}

        {/* Server List */}
        {servers.length > 0 && (
          <div className="border-t border-border-glass/60 pt-3.5 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] font-semibold text-muted-foreground">
              Configured servers
            </p>
            {servers.map(server => {
              const serverState = serverStates[server.id];
              const hasActiveState = serverState?.status && serverState.status !== 'disconnected';
              const status = hasActiveState ? serverState.status : 'ready';
              const toolCount = serverState?.tools?.length;

              const statusConfigMap: Record<
                string,
                { dotColor: string; tone: StatusPillTone; label: string }
              > = {
                connected: { dotColor: 'bg-primary', tone: 'ready', label: 'Connected' },
                connecting: {
                  dotColor: 'bg-status-warning animate-pulse',
                  tone: 'warning',
                  label: 'Connecting',
                },
                disconnected: { dotColor: 'bg-muted-foreground', tone: 'idle', label: 'Idle' },
                error: { dotColor: 'bg-status-error', tone: 'error', label: 'Error' },
                ready: { dotColor: 'bg-primary', tone: 'ready', label: 'Ready' },
              };
              const statusConfig = statusConfigMap[status] ?? {
                dotColor: 'bg-muted-foreground',
                tone: 'idle' as StatusPillTone,
                label: status,
              };

              const isInternalMcp =
                server.id === MCP_SERVER_NAME || server.name === MCP_SERVER_NAME;

              return (
                <div
                  key={server.id}
                  className="flex items-center gap-3 rounded-lg border border-border-glass bg-card/30 p-3"
                >
                  <span
                    className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusConfig.dotColor)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {server.name}
                      </span>
                      {isInternalMcp && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          Internal
                        </span>
                      )}
                    </div>
                    {toolCount !== undefined && toolCount > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {toolCount} tools available
                      </div>
                    )}
                    {serverState?.errorMessage && (
                      <div
                        className="text-xs text-status-error truncate"
                        title={serverState.errorMessage}
                      >
                        {serverState.errorMessage}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{statusConfig.label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && servers.length === 0 && (
          <div className="border-t border-border-glass/60 pt-3.5 text-center text-muted-foreground">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No MCP servers discovered</p>
            <p className="text-xs mt-1">MCP servers will appear here when a project is open</p>
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
