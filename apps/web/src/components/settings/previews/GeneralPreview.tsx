import { useWorkspaceStore, selectActiveTab } from '@/stores/useWorkspaceStore';
import { useAppVersion } from '@/hooks/useAppVersion';
import { APP_NAME } from '@omniscribe/shared';

/**
 * App-shell diagram. Shows fake titlebar dots, the app name + version,
 * and a tabstrip whose active tab reflects the workspace's current
 * project. Gives the General settings panel a sense of "this is the
 * window you're in" without inventing data the section doesn't already
 * read.
 */
export function GeneralPreview() {
  const tabs = useWorkspaceStore(s => s.tabs);
  const activeTab = useWorkspaceStore(selectActiveTab);
  const version = useAppVersion();

  // Ensure at least 2 tab slots so the diagram looks like a tabstrip,
  // never just a single chip floating in space.
  const displayTabs =
    tabs.length > 0
      ? tabs.slice(0, 4)
      : [{ id: 'placeholder-1', name: 'No project', projectPath: '' }];

  return (
    <div className="rounded-lg border border-border-glass bg-background/40 overflow-hidden">
      {/* Titlebar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-glass/60 bg-card/40">
        <div className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-status-error/70" />
          <span className="size-2 rounded-full bg-status-warning/70" />
          <span className="size-2 rounded-full bg-status-success/70" />
        </div>
        <span className="text-[11px] font-mono text-muted-foreground/80 truncate">
          {APP_NAME}
          {version ? ` · v${version}` : ''}
        </span>
      </div>
      {/* Tabstrip */}
      <div className="flex items-center gap-1 px-2 pt-2">
        {displayTabs.map(tab => {
          const isActive = activeTab?.id === tab.id;
          return (
            <div
              key={tab.id}
              className={
                'flex items-center gap-1.5 px-2.5 py-1 rounded-t-md text-[11px] font-medium border border-b-0 ' +
                (isActive
                  ? 'bg-card text-foreground border-border-glass'
                  : 'bg-background/50 text-muted-foreground border-transparent')
              }
            >
              <span
                className={
                  'size-1.5 rounded-full ' + (isActive ? 'bg-primary' : 'bg-muted-foreground/50')
                }
                aria-hidden="true"
              />
              <span className="truncate max-w-[110px]">{tab.name}</span>
            </div>
          );
        })}
        {tabs.length > 4 && (
          <span className="text-[10px] text-muted-foreground tabular-nums px-1">
            +{tabs.length - 4}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="bg-card/40 border-t border-border-glass/60 p-3 space-y-1.5">
        <div className="h-1.5 rounded bg-muted/60" style={{ width: '85%' }} />
        <div className="h-1.5 rounded bg-muted/40" style={{ width: '60%' }} />
        <div className="h-1.5 rounded bg-primary/50" style={{ width: '35%' }} />
      </div>
    </div>
  );
}
