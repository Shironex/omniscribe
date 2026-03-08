import { type ReactNode, useState } from 'react';
import { AlertTriangle, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { createLogger } from '@omniscribe/shared';
import { createErrorBoundary } from '@/components/shared/BaseErrorBoundary';

const logger = createLogger('TerminalErrorBoundary');

interface Props {
  children: ReactNode;
  sessionId: number;
  onRestart?: () => void;
}

function TerminalErrorFallback({
  error,
  onReset,
  onRestart,
}: {
  error: Error | null;
  onReset: () => void;
  onRestart?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const handleRestart = () => {
    onReset();
    onRestart?.();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-card text-foreground p-6 gap-4">
      <AlertTriangle className="w-10 h-10 text-destructive" />
      <h3 className="text-lg font-semibold">Terminal Crashed</h3>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        The terminal encountered an unexpected error (WebGL context loss, canvas error, or rendering
        failure).
      </p>

      <button
        type="button"
        onClick={handleRestart}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm"
      >
        <RotateCcw size={14} />
        Restart Terminal
      </button>

      <button
        type="button"
        onClick={() => setShowDetails(prev => !prev)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Technical Details
      </button>

      {showDetails && error && (
        <pre className="text-xs bg-muted p-3 rounded-md max-w-md overflow-auto max-h-32 text-muted-foreground">
          {error.message}
          {'\n'}
          {error.stack}
        </pre>
      )}
    </div>
  );
}

export const TerminalErrorBoundary = createErrorBoundary<Props>(
  props => ({
    onCatch(error, errorInfo) {
      logger.error('Terminal crashed', error, errorInfo);
    },
    renderFallback(error, reset) {
      return <TerminalErrorFallback error={error} onReset={reset} onRestart={props.onRestart} />;
    },
  }),
  undefined,
  'TerminalErrorBoundary'
);
