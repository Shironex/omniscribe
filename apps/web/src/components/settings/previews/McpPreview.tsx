import { useMemo } from 'react';
import { Sparkles, Server } from 'lucide-react';
import { useMcpStore } from '@/stores/useMcpStore';
import { cn } from '@/lib/utils';

/**
 * Hub-and-spoke topology mirror of the user's actual MCP wiring. A central
 * "session" node sits in the middle; each configured server radiates from
 * it as a satellite node. Connected servers glow with the primary tint and
 * draw a solid spoke; idle ones use a dashed muted spoke.
 *
 * Implemented in pure SVG so it scales cleanly and shares no shape with
 * the other settings previews (toast, terminal, tile, log-tail).
 */
const VIEW_W = 320;
const VIEW_H = 132;
const CENTER = { x: VIEW_W / 2, y: VIEW_H / 2 };
const RADIUS = 50;
const MAX_NODES = 6;

export function McpPreview() {
  const servers = useMcpStore(state => state.servers);
  const serverStates = useMcpStore(state => state.serverStates);

  const nodes = useMemo(() => {
    const slice = servers.slice(0, MAX_NODES);
    const count = Math.max(slice.length, 1);
    return slice.map((server, idx) => {
      // Spread nodes evenly around the hub, biased to the right hemisphere.
      const angle = (Math.PI * 2 * idx) / count - Math.PI / 2;
      const x = CENTER.x + Math.cos(angle) * RADIUS;
      const y = CENTER.y + Math.sin(angle) * RADIUS;
      const status = serverStates[server.id]?.status ?? 'disconnected';
      const connected = status === 'connected';
      return { id: server.id, name: server.name, x, y, connected };
    });
  }, [servers, serverStates]);

  const overflow = Math.max(0, servers.length - MAX_NODES);

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 p-2">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        width="100%"
        height={VIEW_H}
        role="img"
        aria-label={`${servers.length} MCP server${servers.length === 1 ? '' : 's'} configured`}
      >
        {/* Spokes — drawn first so nodes sit on top */}
        {nodes.map(n => (
          <line
            key={`spoke-${n.id}`}
            x1={CENTER.x}
            y1={CENTER.y}
            x2={n.x}
            y2={n.y}
            stroke="currentColor"
            strokeWidth={1}
            strokeDasharray={n.connected ? undefined : '3 3'}
            className={n.connected ? 'text-primary/60' : 'text-border-glass'}
          />
        ))}

        {/* Hub */}
        <circle
          cx={CENTER.x}
          cy={CENTER.y}
          r={18}
          className="fill-primary/15 stroke-primary/40"
          strokeWidth={1}
        />
        <foreignObject x={CENTER.x - 9} y={CENTER.y - 9} width={18} height={18} aria-hidden="true">
          <div className="grid place-items-center text-primary">
            <Sparkles className="w-[14px] h-[14px]" />
          </div>
        </foreignObject>

        {/* Satellite nodes */}
        {nodes.map(n => (
          <g key={`node-${n.id}`}>
            <circle
              cx={n.x}
              cy={n.y}
              r={11}
              className={cn(
                'stroke-1',
                n.connected ? 'fill-primary/15 stroke-primary/40' : 'fill-card stroke-border-glass'
              )}
            />
            <foreignObject x={n.x - 7} y={n.y - 7} width={14} height={14} aria-hidden="true">
              <div
                className={cn(
                  'grid place-items-center',
                  n.connected ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Server className="w-[11px] h-[11px]" />
              </div>
            </foreignObject>
            <title>{n.name}</title>
          </g>
        ))}
      </svg>
      <div className="flex items-center justify-between px-1 text-[10px] uppercase tracking-[0.18em] font-mono font-semibold text-muted-foreground">
        <span>
          {servers.length === 0
            ? 'No servers configured'
            : `${servers.length} server${servers.length === 1 ? '' : 's'}`}
        </span>
        {overflow > 0 && <span>+{overflow} more</span>}
      </div>
    </div>
  );
}
