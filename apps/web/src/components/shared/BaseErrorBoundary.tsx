import { Component, type ReactNode, type ErrorInfo } from 'react';

export interface BaseErrorBoundaryProps {
  children: ReactNode;
}

export interface BaseErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export interface BaseErrorBoundaryOptions {
  /** Logger name or function called on componentDidCatch */
  onCatch: (error: Error, errorInfo: ErrorInfo) => void;
  /** Render the fallback UI when an error is caught */
  renderFallback: (error: Error | null, reset: () => void) => ReactNode;
}

/**
 * Factory that creates an error boundary component with shared getDerivedStateFromError
 * and componentDidCatch logic. Each consumer provides its own catch handler and fallback UI.
 *
 * This eliminates duplicated error boundary boilerplate across ErrorBoundary,
 * TerminalErrorBoundary, and PluginErrorBoundary.
 */
export function createErrorBoundary<TProps extends BaseErrorBoundaryProps>(
  options: BaseErrorBoundaryOptions | ((props: TProps) => BaseErrorBoundaryOptions),
  initialState?: Partial<BaseErrorBoundaryState>
) {
  type State = BaseErrorBoundaryState;

  return class extends Component<TProps, State> {
    constructor(props: TProps) {
      super(props);
      this.state = { hasError: false, error: null, ...initialState };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
      return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
      const opts = typeof options === 'function' ? options(this.props) : options;
      opts.onCatch(error, errorInfo);
    }

    reset = () => {
      this.setState({ hasError: false, error: null });
    };

    render() {
      if (this.state.hasError) {
        const opts = typeof options === 'function' ? options(this.props) : options;
        return opts.renderFallback(this.state.error, this.reset);
      }
      return this.props.children;
    }
  };
}
