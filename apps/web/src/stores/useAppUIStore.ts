import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppUIState {
  isHistoryOpen: boolean;
  isLaunchModalOpen: boolean;
}

interface AppUIActions {
  toggleHistory: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  openLaunchModal: () => void;
  closeLaunchModal: () => void;
}

type AppUIStore = AppUIState & AppUIActions;

export const useAppUIStore = create<AppUIStore>()(
  devtools(
    set => ({
      isHistoryOpen: false,
      isLaunchModalOpen: false,

      toggleHistory: () => {
        set(state => ({ isHistoryOpen: !state.isHistoryOpen }), undefined, 'appUI/toggleHistory');
      },

      openHistory: () => {
        set({ isHistoryOpen: true }, undefined, 'appUI/openHistory');
      },

      closeHistory: () => {
        set({ isHistoryOpen: false }, undefined, 'appUI/closeHistory');
      },

      openLaunchModal: () => {
        set({ isLaunchModalOpen: true }, undefined, 'appUI/openLaunchModal');
      },

      closeLaunchModal: () => {
        set({ isLaunchModalOpen: false }, undefined, 'appUI/closeLaunchModal');
      },
    }),
    { name: 'appUI' }
  )
);

export const selectIsHistoryOpen = (state: AppUIStore) => state.isHistoryOpen;
export const selectIsLaunchModalOpen = (state: AppUIStore) => state.isLaunchModalOpen;
