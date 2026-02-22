import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const MAX_RETRIES = 3;

interface PluginErrorBoundaryProps {
  /** Plugin ID for error attribution */
  pluginId: string;
  children: ReactNode;
}

interface PluginErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

/**
 * Error boundary for plugin-contributed React components.
 *
 * Catches render errors from plugin components and displays a subtle
 * warning icon with tooltip details and a retry button. This prevents
 * a broken plugin from crashing the entire application UI.
 *
 * Retries are limited to MAX_RETRIES to prevent infinite crash-retry loops.
 * Following the existing TerminalErrorBoundary pattern.
 */
export class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<PluginErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Plugin:${this.props.pluginId}] Component error:`, error, info);
  }

  handleRetry = () => {
    if (this.state.retryCount >= MAX_RETRIES) return;
    this.setState(prev => ({ hasError: false, error: null, retryCount: prev.retryCount + 1 }));
  };

  render() {
    if (this.state.hasError) {
      const canRetry = this.state.retryCount < MAX_RETRIES;

      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
              {canRetry && (
                <button
                  type="button"
                  onClick={this.handleRetry}
                  className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Retry plugin ${this.props.pluginId}`}
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Plugin error: {this.state.error?.message ?? 'Unknown error'}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return this.props.children;
  }
}
