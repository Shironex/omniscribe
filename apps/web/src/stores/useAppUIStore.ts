import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppUIState {
  isHistoryOpen: boolean;
  isLaunchModalOpen: boolean;
  isDiffPanelOpen: boolean;
  diffPanelSessionId: string | null;
  isSidebarCollapsed: boolean;
  expandedProjects: string[];
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
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleProjectExpanded: (projectPath: string) => void;
}

type AppUIStore = AppUIState & AppUIActions;

export const useAppUIStore = create<AppUIStore>()(
  devtools(
    set => ({
      isHistoryOpen: false,
      isLaunchModalOpen: false,
      isDiffPanelOpen: false,
      diffPanelSessionId: null,
      isSidebarCollapsed: false,
      expandedProjects: [],

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

      toggleSidebar: () => {
        set(
          state => ({ isSidebarCollapsed: !state.isSidebarCollapsed }),
          undefined,
          'appUI/toggleSidebar'
        );
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ isSidebarCollapsed: collapsed }, undefined, 'appUI/setSidebarCollapsed');
      },

      toggleProjectExpanded: (projectPath: string) => {
        set(
          state => {
            const isExpanded = state.expandedProjects.includes(projectPath);
            return {
              expandedProjects: isExpanded
                ? state.expandedProjects.filter(p => p !== projectPath)
                : [...state.expandedProjects, projectPath],
            };
          },
          undefined,
          'appUI/toggleProjectExpanded'
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
export const selectIsSidebarCollapsed = (state: AppUIStore) => state.isSidebarCollapsed;
export const selectExpandedProjects = (state: AppUIStore) => state.expandedProjects;
