import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  sessionId: number;
  onRestart?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}

export class TerminalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Terminal crashed:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
    this.props.onRestart?.();
  };

  toggleDetails = () => {
    this.setState(prev => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-card text-foreground p-6 gap-4">
          <AlertTriangle className="w-10 h-10 text-destructive" />
          <h3 className="text-lg font-semibold">Terminal Crashed</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            The terminal encountered an unexpected error (WebGL context loss, canvas error, or
            rendering failure).
          </p>

          <button
            onClick={this.handleRestart}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
          >
            <RotateCcw size={14} />
            Restart Terminal
          </button>

          <button
            onClick={this.toggleDetails}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {this.state.showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Technical Details
          </button>

          {this.state.showDetails && this.state.error && (
            <pre className="text-xs bg-muted p-3 rounded-md max-w-md overflow-auto max-h-32 text-muted-foreground">
              {this.state.error.message}
              {'\n'}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
