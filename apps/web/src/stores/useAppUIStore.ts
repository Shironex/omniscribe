import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppUIState {
  isHistoryOpen: boolean;
  isLaunchModalOpen: boolean;
  isDiffPanelOpen: boolean;
  diffPanelSessionId: string | null;
}

interface AppUIActions {
  toggleHistory: () => void;
  openHistory: () => void;
  closeHistory: () => void;
  openLaunchModal: () => void;
  closeLaunchModal: () => void;
  openDiffPanel: (sessionId: string) => void;
  closeDiffPanel: () => void;
  toggleDiffPanel: (sessionId: string) => void;
}

type AppUIStore = AppUIState & AppUIActions;

export const useAppUIStore = create<AppUIStore>()(
  devtools(
    set => ({
      isHistoryOpen: false,
      isLaunchModalOpen: false,
      isDiffPanelOpen: false,
      diffPanelSessionId: null,

      toggleHistory: () => {
        set(
          state => ({
            isHistoryOpen: !state.isHistoryOpen,
            // Close diff panel when opening history
            ...(!state.isHistoryOpen ? { isDiffPanelOpen: false, diffPanelSessionId: null } : {}),
          }),
          undefined,
          'appUI/toggleHistory'
        );
      },

      openHistory: () => {
        set(
          { isHistoryOpen: true, isDiffPanelOpen: false, diffPanelSessionId: null },
          undefined,
          'appUI/openHistory'
        );
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

      openDiffPanel: (sessionId: string) => {
        set(
          { isDiffPanelOpen: true, diffPanelSessionId: sessionId, isHistoryOpen: false },
          undefined,
          'appUI/openDiffPanel'
        );
      },

      closeDiffPanel: () => {
        set(
          { isDiffPanelOpen: false, diffPanelSessionId: null },
          undefined,
          'appUI/closeDiffPanel'
        );
      },

      toggleDiffPanel: (sessionId: string) => {
        set(
          state => {
            const isOpen = state.isDiffPanelOpen && state.diffPanelSessionId === sessionId;
            return {
              isDiffPanelOpen: !isOpen,
              diffPanelSessionId: isOpen ? null : sessionId,
              // Close history panel when opening diff panel
              ...(!isOpen ? { isHistoryOpen: false } : {}),
            };
          },
          undefined,
          'appUI/toggleDiffPanel'
        );
      },
    }),
    { name: 'appUI' }
  )
);

export const selectIsHistoryOpen = (state: AppUIStore) => state.isHistoryOpen;
export const selectIsLaunchModalOpen = (state: AppUIStore) => state.isLaunchModalOpen;
export const selectIsDiffPanelOpen = (state: AppUIStore) => state.isDiffPanelOpen;
export const selectDiffPanelSessionId = (state: AppUIStore) => state.diffPanelSessionId;
