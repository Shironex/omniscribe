import { useState, useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';

const logger = createLogger('GeneralSection');
import { Info } from 'lucide-react';
import { clsx } from 'clsx';
import { APP_NAME } from '@omniscribe/shared';

export function GeneralSection() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVersion() {
      if (window.electronAPI?.app?.getVersion) {
        try {
          logger.debug('Fetching app version');
          const v = await window.electronAPI.app.getVersion();
          setVersion(v);
        } catch (error) {
          logger.error('Failed to get app version:', error);
        }
      }
    }
    fetchVersion();
  }, []);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            'bg-gradient-to-br from-primary/20 to-brand-600/10',
            'ring-1'
          )}
          style={
            {
              '--tw-ring-color': 'color-mix(in oklch, var(--primary), transparent 80%)',
            } as React.CSSProperties
          }
        >
          <Info className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">About</h2>
          <p className="text-sm text-muted-foreground">Application information</p>
        </div>
      </div>

      {/* About Card */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6">
        <div className="text-center space-y-3">
          <div className="text-xl font-bold text-gradient">{APP_NAME}</div>
          {version && <div className="text-sm font-mono text-primary">v{version}</div>}
          <div className="text-sm text-muted-foreground">AI-powered development workspace</div>
        </div>
      </div>
    </div>
  );
}
