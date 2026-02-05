import { create } from 'zustand';

/**
 * Terminal control store state
 * Manages terminal focus and session creation requests
 */
interface TerminalControlState {
  /** Currently focused session ID */
  focusedSessionId: string | null;
  /** Counter to trigger new session creation */
  addSlotRequestCounter: number;
}

/**
 * Terminal control store actions
 */
interface TerminalControlActions {
  /** Set the focused session ID */
  setFocusedSessionId: (sessionId: string | null) => void;
  /** Request adding a new pre-launch slot */
  requestAddSlot: () => void;
  /** Reset the add slot request counter (called after handling) */
  resetAddSlotRequest: () => number;
}

/**
 * Combined store type
 */
type TerminalControlStore = TerminalControlState & TerminalControlActions;

/**
 * Terminal control store using Zustand
 * Provides shared state for terminal focus and session management across components
 */
export const useTerminalControlStore = create<TerminalControlStore>((set, get) => ({
  // Initial state
  focusedSessionId: null,
  addSlotRequestCounter: 0,

  // Actions
  setFocusedSessionId: sessionId => {
    set({ focusedSessionId: sessionId });
  },

  requestAddSlot: () => {
    set(state => ({ addSlotRequestCounter: state.addSlotRequestCounter + 1 }));
  },

  resetAddSlotRequest: () => {
    const current = get().addSlotRequestCounter;
    return current;
  },
}));

// Selectors

/**
 * Select focused session ID
 */
export const selectFocusedSessionId = (state: TerminalControlStore) => state.focusedSessionId;

/**
 * Select add slot request counter
 */
export const selectAddSlotRequestCounter = (state: TerminalControlStore) =>
  state.addSlotRequestCounter;
