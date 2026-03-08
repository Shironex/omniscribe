import { type ReactNode, useRef } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { createLogger } from '@omniscribe/shared';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  createErrorBoundary,
  type BaseErrorBoundaryProps,
} from '@/components/shared/BaseErrorBoundary';

const logger = createLogger('PluginErrorBoundary');
const MAX_RETRIES = 3;

interface PluginErrorBoundaryProps {
  /** Plugin ID for error attribution */
  pluginId: string;
  children: ReactNode;
}

interface InnerProps extends BaseErrorBoundaryProps {
  pluginId: string;
  retryCountRef: React.MutableRefObject<number>;
}

const InnerBoundary = createErrorBoundary<InnerProps>(
  props => ({
    onCatch(error, info) {
      logger.error(`[Plugin:${props.pluginId}] Component error:`, error, info);
    },
    renderFallback(error, reset) {
      const canRetry = (props.retryCountRef.current ?? 0) < MAX_RETRIES;

      const handleRetry = () => {
        if (!canRetry) return;
        props.retryCountRef.current += 1;
        reset();
      };

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
              {canRetry && (
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Retry plugin ${props.pluginId}`}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Plugin error: {error?.message ?? 'Unknown error'}</p>
          </TooltipContent>
        </Tooltip>
      );
    },
  }),
  undefined,
  'PluginErrorBoundary'
);

/**
 * Error boundary for plugin-contributed React components.
 *
 * Catches render errors from plugin components and displays a subtle
 * warning icon with tooltip details and a retry button. This prevents
 * a broken plugin from crashing the entire application UI.
 *
 * Retries are limited to MAX_RETRIES to prevent infinite crash-retry loops.
 */
export function PluginErrorBoundary({ pluginId, children }: PluginErrorBoundaryProps) {
  const retryCountRef = useRef(0);
  return (
    <InnerBoundary pluginId={pluginId} retryCountRef={retryCountRef}>
      {children}
    </InnerBoundary>
  );
}
