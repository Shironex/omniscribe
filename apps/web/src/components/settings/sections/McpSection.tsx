import { Server, CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useMcpStore } from '../../../stores';

export function McpSection() {
  const servers = useMcpStore((state) => state.servers);
  const serverStates = useMcpStore((state) => state.serverStates);
  const isLoading = useMcpStore((state) => state.isDiscovering);
  const discoverServers = useMcpStore((state) => state.discoverServers);

  // Count connected servers from serverStates map
  const connectedCount = servers.filter((s) => {
    const state = serverStates.get(s.id);
    return state?.status === 'connected';
  }).length;

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
          onClick={() => discoverServers()}
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

      {/* Status Summary */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">
              Connection Status
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {connectedCount} of {servers.length} servers connected
            </p>
          </div>
          {connectedCount === servers.length && servers.length > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-status-success bg-status-success-bg px-2 py-1 rounded-full">
              <CheckCircle2 className="w-3 h-3" />
              All Connected
            </span>
          ) : connectedCount > 0 ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-status-warning bg-status-warning-bg px-2 py-1 rounded-full">
              <XCircle className="w-3 h-3" />
              Partial
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
          <h3 className="text-sm font-medium text-foreground">Discovered Servers</h3>
          <div className="space-y-2">
            {servers.map((server) => {
              const serverState = serverStates.get(server.id);
              const status = serverState?.status ?? 'disconnected';
              const toolCount = serverState?.tools?.length;

              return (
                <div
                  key={server.id}
                  className="rounded-lg border border-border/50 bg-card/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={clsx(
                        'w-2 h-2 rounded-full',
                        status === 'connected'
                          ? 'bg-status-success'
                          : status === 'connecting'
                            ? 'bg-status-warning animate-pulse'
                            : 'bg-muted-foreground',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {server.name}
                      </div>
                      {toolCount !== undefined && toolCount > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {toolCount} tools available
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {status}
                    </div>
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
              MCP servers will appear here when a session is active
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
