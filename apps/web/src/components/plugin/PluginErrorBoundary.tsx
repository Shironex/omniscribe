import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface PluginErrorBoundaryProps {
  /** Plugin ID for error attribution */
  pluginId: string;
  children: ReactNode;
  className?: string;
}

interface PluginErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for plugin-contributed React components.
 *
 * Catches render errors from plugin components and displays a subtle
 * warning icon with tooltip details. This prevents a broken plugin
 * from crashing the entire application UI.
 *
 * Following the existing TerminalErrorBoundary pattern.
 */
export class PluginErrorBoundary extends Component<
  PluginErrorBoundaryProps,
  PluginErrorBoundaryState
> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<PluginErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Plugin:${this.props.pluginId}] Component error:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center">
              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
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
