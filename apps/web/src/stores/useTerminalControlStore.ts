import { create } from 'zustand';

/**
 * Terminal control store state
 * Manages terminal focus, session creation requests, and ordering
 */
interface TerminalControlState {
  /** Currently focused session ID */
  focusedSessionId: string | null;
  /** Counter to trigger new session creation */
  addSlotRequestCounter: number;
  /** Session order for drag-drop reordering */
  sessionOrder: string[];
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
  /** Set the session order */
  setSessionOrder: (order: string[]) => void;
  /** Reorder sessions by moving activeId to the position of overId */
  reorderSessions: (activeId: string, overId: string) => void;
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
  sessionOrder: [],

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

  setSessionOrder: order => {
    set({ sessionOrder: order });
  },

  reorderSessions: (activeId, overId) => {
    const { sessionOrder } = get();
    const oldIndex = sessionOrder.indexOf(activeId);
    const newIndex = sessionOrder.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...sessionOrder];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, activeId);
    set({ sessionOrder: newOrder });
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
