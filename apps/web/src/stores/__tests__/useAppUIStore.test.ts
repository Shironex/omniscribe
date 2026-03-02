import { describe, it, expect, beforeEach } from 'vitest';
import { useAppUIStore, selectIsHistoryOpen, selectIsLaunchModalOpen } from '../useAppUIStore';

const initialState = {
  isHistoryOpen: false,
  isLaunchModalOpen: false,
};

describe('useAppUIStore', () => {
  beforeEach(() => {
    useAppUIStore.setState(initialState);
  });

  describe('initial state', () => {
    it('starts with history closed', () => {
      expect(useAppUIStore.getState().isHistoryOpen).toBe(false);
    });

    it('starts with launch modal closed', () => {
      expect(useAppUIStore.getState().isLaunchModalOpen).toBe(false);
    });
  });

  describe('history actions', () => {
    it('openHistory sets isHistoryOpen to true', () => {
      useAppUIStore.getState().openHistory();
      expect(useAppUIStore.getState().isHistoryOpen).toBe(true);
    });

    it('closeHistory sets isHistoryOpen to false', () => {
      useAppUIStore.setState({ isHistoryOpen: true });
      useAppUIStore.getState().closeHistory();
      expect(useAppUIStore.getState().isHistoryOpen).toBe(false);
    });

    it('toggleHistory flips isHistoryOpen from false to true', () => {
      useAppUIStore.getState().toggleHistory();
      expect(useAppUIStore.getState().isHistoryOpen).toBe(true);
    });

    it('toggleHistory flips isHistoryOpen from true to false', () => {
      useAppUIStore.setState({ isHistoryOpen: true });
      useAppUIStore.getState().toggleHistory();
      expect(useAppUIStore.getState().isHistoryOpen).toBe(false);
    });

    it('history actions do not affect launch modal state', () => {
      useAppUIStore.setState({ isLaunchModalOpen: true });
      useAppUIStore.getState().openHistory();
      expect(useAppUIStore.getState().isLaunchModalOpen).toBe(true);

      useAppUIStore.getState().closeHistory();
      expect(useAppUIStore.getState().isLaunchModalOpen).toBe(true);
    });
  });

  describe('launch modal actions', () => {
    it('openLaunchModal sets isLaunchModalOpen to true', () => {
      useAppUIStore.getState().openLaunchModal();
      expect(useAppUIStore.getState().isLaunchModalOpen).toBe(true);
    });

    it('closeLaunchModal sets isLaunchModalOpen to false', () => {
      useAppUIStore.setState({ isLaunchModalOpen: true });
      useAppUIStore.getState().closeLaunchModal();
      expect(useAppUIStore.getState().isLaunchModalOpen).toBe(false);
    });

    it('launch modal actions do not affect history state', () => {
      useAppUIStore.setState({ isHistoryOpen: true });
      useAppUIStore.getState().openLaunchModal();
      expect(useAppUIStore.getState().isHistoryOpen).toBe(true);

      useAppUIStore.getState().closeLaunchModal();
      expect(useAppUIStore.getState().isHistoryOpen).toBe(true);
    });
  });

  describe('selectors', () => {
    it('selectIsHistoryOpen returns isHistoryOpen', () => {
      const state = useAppUIStore.getState();
      expect(selectIsHistoryOpen(state)).toBe(false);

      useAppUIStore.getState().openHistory();
      expect(selectIsHistoryOpen(useAppUIStore.getState())).toBe(true);
    });

    it('selectIsLaunchModalOpen returns isLaunchModalOpen', () => {
      const state = useAppUIStore.getState();
      expect(selectIsLaunchModalOpen(state)).toBe(false);

      useAppUIStore.getState().openLaunchModal();
      expect(selectIsLaunchModalOpen(useAppUIStore.getState())).toBe(true);
    });
  });
});
