import { useRef, useState, useCallback, useEffect } from 'react';
import { createLogger } from '@omniscribe/shared';
import type { Terminal } from '@xterm/xterm';
import { connectTerminal, joinTerminal } from '@/lib/terminal';

const logger = createLogger('TerminalConnection');

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

/** Max buffer size for hidden terminals to prevent unbounded growth (1MB) */
const MAX_HIDDEN_BUFFER_SIZE = 1_048_576;

export interface UseTerminalConnectionReturn {
  status: TerminalStatus;
  setStatus: React.Dispatch<React.SetStateAction<TerminalStatus>>;
  connectionRef: React.MutableRefObject<ReturnType<typeof connectTerminal> | null>;
  handleOutput: (data: string) => void;
  handleClose: (exitCode: number, signal?: number) => void;
  connectAndJoin: (sessionId: number) => void;
  /** Flush any accumulated write buffer data (call when terminal becomes visible) */
  flushBuffer: () => void;
}

/**
 * Hook that manages terminal connection state and output/close handlers.
 * Uses requestAnimationFrame buffering to coalesce multiple socket events
 * into a single xterm.write() per frame, reducing CPU pressure from ~250
 * writes/sec to ~60 writes/sec.
 *
 * When `isActiveRef.current` is false (hidden terminal), RAF scheduling is
 * paused and data accumulates in the write buffer. Call `flushBuffer()` when
 * the terminal becomes visible to write all buffered data at once.
 */
export function useTerminalConnection(
  xtermRef: React.MutableRefObject<Terminal | null>,
  isDisposedRef: React.MutableRefObject<boolean>,
  onCloseRef: React.MutableRefObject<((exitCode: number, signal?: number) => void) | undefined>,
  isActiveRef: React.MutableRefObject<boolean>
): UseTerminalConnectionReturn {
  const connectionRef = useRef<ReturnType<typeof connectTerminal> | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('connecting');

  // RAF write buffer: accumulate data from socket events, flush once per frame
  const writeBufferRef = useRef('');
  const rafIdRef = useRef<number | null>(null);

  const flushWriteBuffer = useCallback(() => {
    rafIdRef.current = null;
    if (isDisposedRef.current || !xtermRef.current || writeBufferRef.current.length === 0) return;
    try {
      xtermRef.current.write(writeBufferRef.current);
    } catch {
      logger.debug('flushWriteBuffer write failed (terminal may be disposed)');
    }
    writeBufferRef.current = '';
  }, [xtermRef, isDisposedRef]);

  const handleOutput = useCallback(
    (data: string) => {
      if (isDisposedRef.current) return;
      writeBufferRef.current += data;

      // Cap buffer size when hidden to prevent unbounded memory growth
      if (!isActiveRef.current && writeBufferRef.current.length > MAX_HIDDEN_BUFFER_SIZE) {
        writeBufferRef.current = writeBufferRef.current.slice(-MAX_HIDDEN_BUFFER_SIZE);
      }

      // Only schedule RAF when terminal is visible
      if (isActiveRef.current && rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(flushWriteBuffer);
      }
    },
    [isDisposedRef, isActiveRef, flushWriteBuffer]
  );

  // Expose a method to flush the buffer (called when terminal becomes visible)
  const flushBuffer = useCallback(() => {
    if (writeBufferRef.current.length > 0 && rafIdRef.current === null && !isDisposedRef.current) {
      rafIdRef.current = requestAnimationFrame(flushWriteBuffer);
    }
  }, [flushWriteBuffer, isDisposedRef]);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // Flush any remaining data synchronously on cleanup
      if (writeBufferRef.current.length > 0 && xtermRef.current && !isDisposedRef.current) {
        try {
          xtermRef.current.write(writeBufferRef.current);
        } catch {
          // Terminal may already be disposed
        }
        writeBufferRef.current = '';
      }
    };
  }, [xtermRef, isDisposedRef]);

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
        joinTerminal(sessionId)
          .then(({ success, scrollback }) => {
            if (success && scrollback && xtermRef.current && !isDisposedRef.current) {
              // Use buffered write for scrollback too
              writeBufferRef.current += scrollback;
              if (isActiveRef.current && rafIdRef.current === null) {
                rafIdRef.current = requestAnimationFrame(flushWriteBuffer);
              }
            }
          })
          .catch(error => {
            logger.error('Failed to join terminal session:', error);
          });
      }
    },
    [handleOutput, handleClose, xtermRef, isDisposedRef, isActiveRef, flushWriteBuffer]
  );

  return {
    status,
    setStatus,
    connectionRef,
    handleOutput,
    handleClose,
    connectAndJoin,
    flushBuffer,
  };
}
