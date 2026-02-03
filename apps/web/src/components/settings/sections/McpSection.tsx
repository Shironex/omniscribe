import { useCallback, useMemo, useEffect } from 'react';
import { Server, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useMcpStore, useWorkspaceStore, selectActiveTab, selectInternalMcp } from '../../../stores';

export function McpSection() {
  const servers = useMcpStore((state) => state.servers);
  const serverStates = useMcpStore((state) => state.serverStates);
  const isLoading = useMcpStore((state) => state.isDiscovering);
  const discoverServers = useMcpStore((state) => state.discoverServers);
  const internalMcp = useMcpStore(selectInternalMcp);

  // Get active project path for refresh
  const activeTab = useWorkspaceStore(selectActiveTab);

  // Auto-fetch servers when component mounts or project changes
  useEffect(() => {
    if (activeTab?.projectPath) {
      discoverServers(activeTab.projectPath);
    }
  }, [activeTab?.projectPath, discoverServers]);

  // Count connected servers from serverStates map
  const connectedCount = useMemo(() => {
    return Array.from(serverStates.values()).filter(
      (state) => state.status === 'connected'
    ).length;
  }, [serverStates]);

  const handleRefresh = useCallback(() => {
    discoverServers(activeTab?.projectPath);
  }, [discoverServers, activeTab?.projectPath]);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-brand-600/10',
            'ring-1 ring-primary/20',
          )}
        >
          <Server className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">MCP Servers</h2>
          <p className="text-sm text-muted-foreground">
            Model Context Protocol server connections
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh MCP servers"
          onClick={handleRefresh}
          disabled={isLoading}
          className={clsx(
            'p-2 rounded-lg transition-colors',
            'hover:bg-muted text-muted-foreground hover:text-foreground',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
          title="Refresh servers"
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Internal MCP Status */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'w-3 h-3 rounded-full',
              internalMcp.available ? 'bg-status-success' : 'bg-status-error'
            )}
          />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-foreground">Internal MCP Server</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {internalMcp.available
                ? internalMcp.path?.split(/[/\\]/).slice(-2).join('/')
                : 'Not available'}
            </p>
          </div>
          <span
            className={clsx(
              'text-xs font-medium px-2 py-1 rounded-full',
              internalMcp.available
                ? 'bg-status-success-bg text-status-success'
                : 'bg-status-error-bg text-status-error'
            )}
          >
            {internalMcp.available ? 'Ready' : 'Unavailable'}
          </span>
        </div>
      </div>

      {/* Status Summary */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Server Status
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {servers.length} server{servers.length !== 1 ? 's' : ''} configured
              {connectedCount > 0 && `, ${connectedCount} active`}
            </p>
          </div>
          {connectedCount === servers.length && servers.length > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-status-success bg-status-success-bg px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              All Active
            </span>
          ) : connectedCount > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-status-warning bg-status-warning-bg px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              {connectedCount} Active
            </span>
          ) : servers.length > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              Ready
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
              None
            </span>
          )}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && servers.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading MCP servers...</span>
          </div>
        </div>
      )}

      {/* Server List */}
      {servers.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Configured Servers</h3>
          <p className="text-xs text-muted-foreground">
            These servers will connect when you start a session
          </p>
          <div className="space-y-2">
            {servers.map((server) => {
              const serverState = serverStates.get(server.id);
              const hasActiveState = serverState?.status && serverState.status !== 'disconnected';
              const status = hasActiveState ? serverState.status : 'ready';
              const toolCount = serverState?.tools?.length;

              // Status display config
              const statusConfig: { color: string; label: string } = {
                connected: { color: 'bg-status-success', label: 'Connected' },
                connecting: { color: 'bg-status-warning animate-pulse', label: 'Connecting' },
                disconnected: { color: 'bg-muted-foreground', label: 'Idle' },
                error: { color: 'bg-status-error', label: 'Error' },
                ready: { color: 'bg-primary', label: 'Ready' },
              }[status] ?? { color: 'bg-muted-foreground', label: status };

              // Check if this is the internal omniscribe MCP
              const isInternalMcp = server.id === 'omniscribe' || server.name === 'omniscribe';

              return (
                <div
                  key={server.id}
                  className="rounded-lg border border-border/50 bg-card/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={clsx('w-2.5 h-2.5 rounded-full', statusConfig.color)}
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
                        <div className="text-xs text-status-error truncate" title={serverState.errorMessage}>
                          {serverState.errorMessage}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {statusConfig.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && servers.length === 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-6">
          <div className="text-center text-muted-foreground">
            <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No MCP servers discovered</p>
            <p className="text-xs mt-1">
              MCP servers will appear here when a project is open
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
