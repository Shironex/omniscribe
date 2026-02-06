import { useRef, useState, useCallback } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import { connectTerminal, joinTerminal } from '@/lib/terminal';

const logger = createLogger('TerminalConnection');

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseTerminalConnectionReturn {
  status: TerminalStatus;
  setStatus: React.Dispatch<React.SetStateAction<TerminalStatus>>;
  connectionRef: React.MutableRefObject<ReturnType<typeof connectTerminal> | null>;
  handleOutput: (data: string) => void;
  handleClose: (exitCode: number, signal?: number) => void;
  connectAndJoin: (sessionId: number) => void;
}

/**
 * Hook that manages terminal connection state and output/close handlers.
 */
export function useTerminalConnection(
  xtermRef: React.MutableRefObject<Terminal | null>,
  isDisposedRef: React.MutableRefObject<boolean>,
  onCloseRef: React.MutableRefObject<((exitCode: number, signal?: number) => void) | undefined>
): UseTerminalConnectionReturn {
  const connectionRef = useRef<ReturnType<typeof connectTerminal> | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('connecting');

  const handleOutput = useCallback(
    (data: string) => {
      if (isDisposedRef.current) return;
      if (xtermRef.current) {
        try {
          xtermRef.current.write(data);
        } catch {
          logger.debug('handleOutput write failed (terminal may be disposed)');
        }
      }
    },
    [xtermRef, isDisposedRef]
  );

  const handleClose = useCallback(
    (exitCode: number, signal?: number) => {
      if (isDisposedRef.current) return;
      setStatus('disconnected');
      onCloseRef.current?.(exitCode, signal);
    },
    [isDisposedRef, onCloseRef]
  );

  const connectAndJoin = useCallback(
    (sessionId: number) => {
      if (!isDisposedRef.current && !connectionRef.current) {
        connectionRef.current = connectTerminal(sessionId, handleOutput, handleClose);
        logger.info('Terminal connected for session', sessionId);
        setStatus('connected');

        // Replay scrollback buffer for sessions that were already running
        joinTerminal(sessionId).then(({ success, scrollback }) => {
          if (success && scrollback && xtermRef.current && !isDisposedRef.current) {
            xtermRef.current.write(scrollback);
          }
        });
      }
    },
    [handleOutput, handleClose, xtermRef, isDisposedRef]
  );

  return {
    status,
    setStatus,
    connectionRef,
    handleOutput,
    handleClose,
    connectAndJoin,
  };
}
