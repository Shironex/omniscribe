import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { createLogger, TerminalEvents, type TerminalBackpressureEvent } from '@omniscribe/shared';
import { IS_WINDOWS, IS_MAC } from '@/lib/platform';
import type { TerminalThemeName } from '@/lib/terminal-themes';
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

const logger = createLogger('TerminalStore');

export type CursorStyle = 'block' | 'underline' | 'bar';

interface TerminalState extends SocketStoreState {
  // Settings
  fontSize: number;
  fontFamily: string[];
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  scrollback: number;
  terminalThemeName: TerminalThemeName;
  // Control
  focusedSessionId: string | null;
  addSlotRequestCounter: number;
  sessionOrder: string[];
  /** Terminal session IDs currently under backpressure */
  backpressured: Record<number, true>;
}

interface TerminalActions extends SocketStoreActions {
  // Settings actions
  setFontSize: (size: number) => void;
  setFontFamily: (family: string[]) => void;
  setFontWeight: (weight: number) => void;
  setLineHeight: (height: number) => void;
  setLetterSpacing: (spacing: number) => void;
  setCursorStyle: (style: CursorStyle) => void;
  setCursorBlink: (blink: boolean) => void;
  setScrollback: (lines: number) => void;
  setTerminalThemeName: (name: TerminalThemeName) => void;
  resetToDefaults: () => void;
  // Control actions
  setFocusedSessionId: (sessionId: string | null) => void;
  requestAddSlot: () => void;
  setSessionOrder: (order: string[]) => void;
  reorderSessions: (activeId: string, overId: string) => void;
  /** Set backpressure state for a terminal */
  setBackpressure: (terminalSessionId: number, paused: boolean) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
}

type TerminalStore = TerminalState & TerminalActions;

const COMMON_DEFAULTS = {
  fontWeight: 400,
  lineHeight: 1.2,
  letterSpacing: 0,
  cursorStyle: 'block' as CursorStyle,
  cursorBlink: true,
  scrollback: 10000,
  terminalThemeName: 'tokyonight' as TerminalThemeName,
};

function getDefaultSettings(): Omit<
  TerminalState,
  | 'focusedSessionId'
  | 'addSlotRequestCounter'
  | 'sessionOrder'
  | 'backpressured'
  | keyof SocketStoreState
> {
  if (IS_WINDOWS) {
    return {
      ...COMMON_DEFAULTS,
      fontSize: 14,
      fontFamily: ['Cascadia Code', 'Consolas', 'Courier New', 'monospace'],
    };
  }
  if (IS_MAC) {
    return {
      ...COMMON_DEFAULTS,
      fontSize: 13,
      fontFamily: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
    };
  }
  // Linux
  return {
    ...COMMON_DEFAULTS,
    fontSize: 13,
    fontFamily: ['Ubuntu Mono', 'DejaVu Sans Mono', 'monospace'],
  };
}

const defaults = getDefaultSettings();

// Clean up old localStorage key from the previous useTerminalSettingsStore
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem('omniscribe-terminal-settings');
  } catch {
    // Ignore errors in environments without localStorage
  }
}

export const useTerminalStore = create<TerminalStore>()(
  devtools(
    persist(
      (set, get) => {
        // Create common socket actions
        const socketActions = createSocketActions<TerminalState>(set, 'terminal');

        // Create socket listeners
        const { initListeners, cleanupListeners } = createSocketListeners<TerminalStore>(
          get,
          set,
          'terminal',
          {
            listeners: [
              {
                event: TerminalEvents.BACKPRESSURE,
                handler: (data, get) => {
                  const payload = data as TerminalBackpressureEvent;
                  logger.debug(TerminalEvents.BACKPRESSURE, payload.sessionId, payload.paused);
                  get().setBackpressure(payload.sessionId, payload.paused);
                },
              },
            ],
            includeConnectionErrorHandler: false,
          }
        );

        return {
          // Settings state (from defaults)
          ...defaults,

          // Common socket state
          ...initialSocketState,

          // Control state
          focusedSessionId: null,
          addSlotRequestCounter: 0,
          sessionOrder: [],
          backpressured: {},

          // Common socket actions
          ...socketActions,

          // Socket listeners
          initListeners,
          cleanupListeners,

          // Settings actions
          setFontSize: size =>
            set({ fontSize: Math.max(8, Math.min(24, size)) }, undefined, 'terminal/setFontSize'),
          setFontFamily: family => set({ fontFamily: family }, undefined, 'terminal/setFontFamily'),
          setFontWeight: weight => set({ fontWeight: weight }, undefined, 'terminal/setFontWeight'),
          setLineHeight: height => set({ lineHeight: height }, undefined, 'terminal/setLineHeight'),
          setLetterSpacing: spacing =>
            set({ letterSpacing: spacing }, undefined, 'terminal/setLetterSpacing'),
          setCursorStyle: style =>
            set({ cursorStyle: style }, undefined, 'terminal/setCursorStyle'),
          setCursorBlink: blink =>
            set({ cursorBlink: blink }, undefined, 'terminal/setCursorBlink'),
          setScrollback: lines =>
            set(
              { scrollback: Math.max(1000, Math.min(100000, lines)) },
              undefined,
              'terminal/setScrollback'
            ),
          setTerminalThemeName: name =>
            set({ terminalThemeName: name }, undefined, 'terminal/setTerminalThemeName'),
          resetToDefaults: () => {
            logger.debug('resetToDefaults');
            set(getDefaultSettings(), undefined, 'terminal/resetToDefaults');
          },

          // Control actions
          setFocusedSessionId: sessionId => {
            logger.debug('setFocusedSessionId', sessionId);
            set({ focusedSessionId: sessionId }, undefined, 'terminal/setFocusedSessionId');
          },
          requestAddSlot: () => {
            logger.debug('requestAddSlot');
            set(
              state => ({ addSlotRequestCounter: state.addSlotRequestCounter + 1 }),
              undefined,
              'terminal/requestAddSlot'
            );
          },
          setSessionOrder: order => {
            logger.debug('setSessionOrder', order.length, 'sessions');
            set({ sessionOrder: order }, undefined, 'terminal/setSessionOrder');
          },
          reorderSessions: (activeId, overId) => {
            logger.debug('reorderSessions', activeId, overId);
            const { sessionOrder } = get();
            const oldIndex = sessionOrder.indexOf(activeId);
            const newIndex = sessionOrder.indexOf(overId);
            if (oldIndex === -1 || newIndex === -1) return;

            const newOrder = [...sessionOrder];
            const [removed] = newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, removed);
            set({ sessionOrder: newOrder }, undefined, 'terminal/reorderSessions');
          },

          setBackpressure: (terminalSessionId, paused) => {
            set(
              state => {
                if (paused) {
                  return {
                    backpressured: { ...state.backpressured, [terminalSessionId]: true as const },
                  };
                }
                const { [terminalSessionId]: _removed, ...rest } = state.backpressured;
                return { backpressured: rest as Record<number, true> };
              },
              undefined,
              'terminal/setBackpressure'
            );
          },
        };
      },
      {
        name: 'omniscribe-terminal',
        version: 1,
        // Only persist settings — control state, backpressure, and socket state are transient
        partialize: state => ({
          fontSize: state.fontSize,
          fontFamily: state.fontFamily,
          fontWeight: state.fontWeight,
          lineHeight: state.lineHeight,
          letterSpacing: state.letterSpacing,
          cursorStyle: state.cursorStyle,
          cursorBlink: state.cursorBlink,
          scrollback: state.scrollback,
          terminalThemeName: state.terminalThemeName,
        }),
      }
    ),
    { name: 'terminal' }
  )
);
