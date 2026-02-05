import { Component, type ReactNode, type ErrorInfo } from 'react';
import { createLogger } from '@omniscribe/shared';
import { AlertCircle, RefreshCw } from 'lucide-react';

const logger = createLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('Uncaught error:', error.message, errorInfo.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
            <AlertCircle size={48} className="text-red-400" />
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Try reloading the application.
            </p>
            {this.state.error && (
              <pre className="text-xs text-red-400 bg-muted/50 rounded-md p-3 max-w-full overflow-auto">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              <RefreshCw size={14} />
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
