import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppUIState {
  isHistoryOpen: boolean;
  isLaunchModalOpen: boolean;
  isSwarmViewOpen: boolean;
  isSwarmConfigOpen: boolean;
}

interface AppUIActions {
  toggleHistory: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  openLaunchModal: () => void;
  closeLaunchModal: () => void;
  openSwarmView: () => void;
  closeSwarmView: () => void;
  toggleSwarmView: () => void;
  openSwarmConfig: () => void;
  closeSwarmConfig: () => void;
}

type AppUIStore = AppUIState & AppUIActions;

export const useAppUIStore = create<AppUIStore>()(
  devtools(
    set => ({
      isHistoryOpen: false,
      isLaunchModalOpen: false,
      isSwarmViewOpen: false,
      isSwarmConfigOpen: false,

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

      openSwarmView: () => {
        set({ isSwarmViewOpen: true }, undefined, 'appUI/openSwarmView');
      },

      closeSwarmView: () => {
        set({ isSwarmViewOpen: false }, undefined, 'appUI/closeSwarmView');
      },

      toggleSwarmView: () => {
        set(
          state => ({ isSwarmViewOpen: !state.isSwarmViewOpen }),
          undefined,
          'appUI/toggleSwarmView'
        );
      },

      openSwarmConfig: () => {
        set({ isSwarmConfigOpen: true }, undefined, 'appUI/openSwarmConfig');
      },

      closeSwarmConfig: () => {
        set({ isSwarmConfigOpen: false }, undefined, 'appUI/closeSwarmConfig');
      },
    }),
    { name: 'appUI' }
  )
);

export const selectIsHistoryOpen = (state: AppUIStore) => state.isHistoryOpen;
export const selectIsLaunchModalOpen = (state: AppUIStore) => state.isLaunchModalOpen;
export const selectIsSwarmViewOpen = (state: AppUIStore) => state.isSwarmViewOpen;
export const selectIsSwarmConfigOpen = (state: AppUIStore) => state.isSwarmConfigOpen;
