import { useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Server,
  Power,
  PowerOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useMcpStore, selectServers } from '../../stores';
import { McpServerStatus } from '@omniscribe/shared';

interface McpSectionProps {
  className?: string;
}

/**
 * Get status icon and color for MCP server status
 */
function getStatusIndicator(status: McpServerStatus): {
  icon: React.ReactNode;
  color: string;
  label: string;
} {
  switch (status) {
    case 'connected':
      return {
        icon: <CheckCircle size={12} />,
        color: 'text-green-400',
        label: 'Connected',
      };
    case 'connecting':
      return {
        icon: <Loader2 size={12} className="animate-spin" />,
        color: 'text-blue-400',
        label: 'Connecting',
      };
    case 'disconnected':
      return {
        icon: <XCircle size={12} />,
        color: 'text-gray-400',
        label: 'Disconnected',
      };
    case 'error':
      return {
        icon: <AlertCircle size={12} />,
        color: 'text-red-400',
        label: 'Error',
      };
    case 'disabled':
      return {
        icon: <PowerOff size={12} />,
        color: 'text-gray-500',
        label: 'Disabled',
      };
    default:
      return {
        icon: <Server size={12} />,
        color: 'text-gray-400',
        label: 'Unknown',
      };
  }
}

export function McpSection({ className }: McpSectionProps) {
  const servers = useMcpStore(selectServers);
  const serverStates = useMcpStore((state) => state.serverStates);
  const enabledServers = useMcpStore((state) => state.enabledServers);
  const isDiscovering = useMcpStore((state) => state.isDiscovering);
  const error = useMcpStore((state) => state.error);
  const setEnabled = useMcpStore((state) => state.setEnabled);
  const discoverServers = useMcpStore((state) => state.discoverServers);
  const connectServer = useMcpStore((state) => state.connectServer);
  const disconnectServer = useMcpStore((state) => state.disconnectServer);
  const initListeners = useMcpStore((state) => state.initListeners);

  // Initialize listeners and discover servers on mount
  useEffect(() => {
    initListeners();
    discoverServers();
  }, [initListeners, discoverServers]);

  const serverCount = servers.length;
  const connectedCount = Array.from(serverStates.values()).filter(
    (s) => s.status === 'connected'
  ).length;

  const handleToggle = (serverId: string, currentlyEnabled: boolean) => {
    setEnabled(serverId, !currentlyEnabled);

    // If enabling, also connect
    if (!currentlyEnabled) {
      connectServer(serverId);
    } else {
      disconnectServer(serverId);
    }
  };

  const handleRefresh = () => {
    discoverServers();
  };

  return (
    <div className={twMerge(clsx('space-y-2', className))}>
      {/* Header with count and refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-omniscribe-text-secondary">
            {serverCount} server{serverCount !== 1 ? 's' : ''}
          </span>
          {connectedCount > 0 && (
            <span className="text-xs text-green-400">
              ({connectedCount} connected)
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isDiscovering}
          className={clsx(
            'p-1 rounded transition-colors',
            'hover:bg-omniscribe-surface',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isDiscovering && 'animate-spin'
          )}
          title="Refresh servers"
        >
          <RefreshCw size={12} className="text-omniscribe-text-muted" />
        </button>
      </div>

      {/* Loading state */}
      {isDiscovering && (
        <div className="text-xs text-omniscribe-text-muted animate-pulse py-2">
          Discovering servers...
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 py-2">
          <AlertCircle size={12} />
          <span className="text-xs truncate">{error}</span>
        </div>
      )}

      {/* Servers list */}
      {!isDiscovering && servers.length === 0 && !error && (
        <div className="text-xs text-omniscribe-text-muted py-2">
          No MCP servers found
        </div>
      )}

      {servers.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {servers.map((server) => {
            const isEnabled = enabledServers.has(server.id);
            const serverState = serverStates.get(server.id);
            const status = serverState?.status ?? (isEnabled ? 'disconnected' : 'disabled');
            const indicator = getStatusIndicator(status);

            return (
              <div
                key={server.id}
                className={clsx(
                  'flex items-center gap-2 px-2 py-1.5 rounded',
                  'transition-colors',
                  isEnabled ? 'bg-omniscribe-surface/50' : 'opacity-60'
                )}
              >
                {/* Status indicator */}
                <span className={indicator.color} title={indicator.label}>
                  {indicator.icon}
                </span>

                {/* Server info */}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-omniscribe-text-secondary truncate">
                    {server.name}
                  </div>
                  {serverState?.errorMessage && (
                    <div className="text-xs text-red-400 truncate" title={serverState.errorMessage}>
                      {serverState.errorMessage}
                    </div>
                  )}
                  {serverState?.tools && serverState.tools.length > 0 && (
                    <div className="text-xs text-omniscribe-text-muted">
                      {serverState.tools.length} tool{serverState.tools.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>

                {/* Toggle button */}
                <button
                  onClick={() => handleToggle(server.id, isEnabled)}
                  className={clsx(
                    'p-1 rounded transition-colors flex-shrink-0',
                    'hover:bg-omniscribe-border',
                    isEnabled
                      ? 'text-green-400 hover:text-red-400'
                      : 'text-gray-400 hover:text-green-400'
                  )}
                  title={isEnabled ? 'Disable server' : 'Enable server'}
                >
                  {isEnabled ? <Power size={12} /> : <PowerOff size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
