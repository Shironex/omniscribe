import type { ReactNode } from 'react';
import { createLogger } from '@omniscribe/shared';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { createErrorBoundary } from './BaseErrorBoundary';

const logger = createLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
}

export const ErrorBoundary = createErrorBoundary<Props>(
  {
    onCatch(error, errorInfo) {
      logger.error('Uncaught error:', error.message, errorInfo.componentStack);
    },
    renderFallback(error) {
      return (
        <div className="h-screen w-screen bg-background text-foreground flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
            <AlertCircle size={48} className="text-destructive" />
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Try reloading the application.
            </p>
            {error && (
              <pre className="text-xs text-destructive bg-muted/50 rounded-md p-3 max-w-full overflow-auto">
                {error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              <RefreshCw size={14} />
              Reload
            </button>
          </div>
        </div>
      );
    },
  },
  undefined,
  'ErrorBoundary'
);
