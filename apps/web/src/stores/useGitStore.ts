import { create } from 'zustand';
import { BranchInfo, CommitInfo, createLogger } from '@omniscribe/shared';
import { socket } from '@/lib/socket';

const logger = createLogger('GitStore');
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

/**
 * Git branch update payload from socket
 */
interface GitBranchUpdate {
  projectPath: string;
  branches: BranchInfo[];
  currentBranch: BranchInfo | null;
}

/**
 * Git commits update payload from socket
 */
interface GitCommitsUpdate {
  projectPath: string;
  commits: CommitInfo[];
}

/**
 * Git checkout result payload from socket
 */
interface GitCheckoutResult {
  projectPath: string;
  success: boolean;
  branch: string;
  error?: string;
}

/**
 * Git store state (extends common socket state)
 */
interface GitState extends SocketStoreState {
  /** All branches for the current project */
  branches: BranchInfo[];
  /** Current branch */
  currentBranch: BranchInfo | null;
  /** Recent commits */
  commits: CommitInfo[];
  /** Current project path being tracked */
  projectPath: string | null;
}

/**
 * Git store actions (extends common socket actions)
 */
interface GitActions extends SocketStoreActions {
  /** Fetch branches for a project */
  fetchBranches: (projectPath: string) => void;
  /** Fetch current branch for a project */
  fetchCurrentBranch: (projectPath: string) => void;
  /** Checkout a branch */
  checkout: (projectPath: string, branchName: string) => void;
  /** Fetch commits for a project */
  fetchCommits: (projectPath: string, limit?: number) => void;
  /** Set branches */
  setBranches: (branches: BranchInfo[]) => void;
  /** Set current branch */
  setCurrentBranch: (branch: BranchInfo | null) => void;
  /** Set commits */
  setCommits: (commits: CommitInfo[]) => void;
  /** Set project path */
  setProjectPath: (projectPath: string | null) => void;
  /** Initialize socket listeners */
  initListeners: () => void;
  /** Clean up socket listeners */
  cleanupListeners: () => void;
  /** Clear store state */
  clear: () => void;
}

/**
 * Combined store type
 */
type GitStore = GitState & GitActions;

/**
 * Git store using Zustand
 */
export const useGitStore = create<GitStore>((set, get) => {
  // Create common socket actions
  const socketActions = createSocketActions<GitState>(set);

  // Create socket listeners
  const { initListeners, cleanupListeners } = createSocketListeners<GitStore>(get, set, {
    listeners: [
      {
        event: 'git:branches:updated',
        handler: (data, get) => {
          const update = data as GitBranchUpdate;
          const currentProjectPath = get().projectPath;
          if (currentProjectPath && update.projectPath === currentProjectPath) {
            get().setBranches(update.branches);
            if (update.currentBranch) {
              get().setCurrentBranch(update.currentBranch);
            }
          }
        },
      },
      {
        event: 'git:commits:updated',
        handler: (data, get) => {
          const update = data as GitCommitsUpdate;
          const currentProjectPath = get().projectPath;
          if (currentProjectPath && update.projectPath === currentProjectPath) {
            get().setCommits(update.commits);
          }
        },
      },
      {
        event: 'git:checkout:result',
        handler: (data, get) => {
          const result = data as GitCheckoutResult;
          const currentProjectPath = get().projectPath;
          if (currentProjectPath && result.projectPath === currentProjectPath) {
            if (!result.success && result.error) {
              get().setError(result.error);
            }
          }
        },
      },
    ],
    onConnect: get => {
      const currentProjectPath = get().projectPath;
      if (currentProjectPath) {
        get().fetchBranches(currentProjectPath);
        get().fetchCurrentBranch(currentProjectPath);
        get().fetchCommits(currentProjectPath);
      }
    },
  });

  return {
    // Initial state (spread common state + custom state)
    ...initialSocketState,
    branches: [],
    currentBranch: null,
    commits: [],
    projectPath: null,

    // Common socket actions
    ...socketActions,

    // Socket listeners
    initListeners,
    cleanupListeners,

    // Custom actions
    fetchBranches: (projectPath: string) => {
      logger.debug('fetchBranches', projectPath);
      set({ isLoading: true, error: null, projectPath });
      socket.emit(
        'git:branches',
        { projectPath },
        (response: {
          branches: BranchInfo[];
          currentBranch: string | BranchInfo;
          error?: string;
        }) => {
          // Backend returns { branches, currentBranch, error? } - no success field
          if (response.error) {
            logger.error('fetchBranches error:', response.error);
            set({ error: response.error, isLoading: false });
          } else {
            const branches = response.branches ?? [];

            // Handle currentBranch which can be either a string or a BranchInfo object
            let currentBranchInfo: BranchInfo | null = null;
            if (response.currentBranch) {
              if (typeof response.currentBranch === 'string') {
                // currentBranch is a string - try to find it in branches array first
                currentBranchInfo = branches.find(b => b.name === response.currentBranch) ?? null;
                // If not found in branches array, create a BranchInfo object from the string
                if (!currentBranchInfo) {
                  currentBranchInfo = {
                    name: response.currentBranch,
                    isRemote: false,
                    isCurrent: true,
                  };
                  // Add to branches array if not already there
                  if (!branches.some(b => b.name === response.currentBranch)) {
                    branches.push(currentBranchInfo);
                  }
                }
              } else {
                // currentBranch is already a BranchInfo object
                currentBranchInfo = response.currentBranch;
                // Ensure it's in the branches array
                if (!branches.some(b => b.name === currentBranchInfo!.name)) {
                  branches.push(currentBranchInfo);
                }
              }
            }

            set({ branches, currentBranch: currentBranchInfo, isLoading: false, error: null });
          }
        }
      );
    },

    fetchCurrentBranch: (projectPath: string) => {
      logger.debug('fetchCurrentBranch', projectPath);
      set({ isLoading: true, error: null, projectPath });
      socket.emit(
        'git:current-branch',
        { projectPath },
        (response: { currentBranch: string; error?: string }) => {
          // Backend returns { currentBranch: string, error? } - no success field, no BranchInfo
          if (response.error) {
            logger.error('fetchCurrentBranch error:', response.error);
            set({ error: response.error, isLoading: false });
          } else {
            // Create a minimal BranchInfo from the branch name
            const branchInfo: BranchInfo | null = response.currentBranch
              ? { name: response.currentBranch, isRemote: false, isCurrent: true }
              : null;
            set({ currentBranch: branchInfo, isLoading: false, error: null });
          }
        }
      );
    },

    checkout: (projectPath: string, branchName: string) => {
      logger.info('Checking out', branchName, 'in', projectPath);
      set({ isLoading: true, error: null });
      socket.emit(
        'git:checkout',
        { projectPath, branch: branchName },
        (response: { success: boolean; currentBranch?: string; error?: string }) => {
          // Backend returns { success, currentBranch?, error? }
          if (response.error || !response.success) {
            logger.error('Checkout error:', response.error ?? 'Failed to checkout branch');
            set({ error: response.error ?? 'Failed to checkout branch', isLoading: false });
          } else {
            // Refresh branches and current branch after checkout
            get().fetchBranches(projectPath);
            get().fetchCurrentBranch(projectPath);
          }
        }
      );
    },

    fetchCommits: (projectPath: string, limit: number = 50) => {
      logger.debug('fetchCommits', projectPath, 'limit:', limit);
      set({ isLoading: true, error: null, projectPath });
      socket.emit(
        'git:commits',
        { projectPath, limit },
        (response: { commits: CommitInfo[]; error?: string }) => {
          // Backend returns { commits, error? } - no success field
          if (response.error) {
            logger.error('fetchCommits error:', response.error);
            set({ error: response.error, isLoading: false });
          } else {
            set({ commits: response.commits ?? [], isLoading: false, error: null });
          }
        }
      );
    },

    setBranches: (branches: BranchInfo[]) => {
      set({ branches });
    },

    setCurrentBranch: (branch: BranchInfo | null) => {
      set({ currentBranch: branch });
    },

    setCommits: (commits: CommitInfo[]) => {
      set({ commits });
    },

    setProjectPath: (projectPath: string | null) => {
      set({ projectPath });
    },

    clear: () => {
      set({
        branches: [],
        currentBranch: null,
        commits: [],
        projectPath: null,
        isLoading: false,
        error: null,
      });
    },
  };
});

// Selectors

/**
 * Select all branches
 */
export const selectBranches = (state: GitStore) => state.branches;

/**
 * Select local branches only
 */
export const selectLocalBranches = (state: GitStore) =>
  state.branches.filter(branch => !branch.isRemote);

/**
 * Select remote branches only
 */
export const selectRemoteBranches = (state: GitStore) =>
  state.branches.filter(branch => branch.isRemote);

/**
 * Select current branch
 */
export const selectCurrentBranch = (state: GitStore) => state.currentBranch;

/**
 * Select commits
 */
export const selectCommits = (state: GitStore) => state.commits;

/**
 * Select branch by name
 */
export const selectBranchByName = (name: string) => (state: GitStore) =>
  state.branches.find(branch => branch.name === name);

/**
 * Select loading state
 */
export const selectGitLoading = (state: GitStore) => state.isLoading;

/**
 * Select error
 */
export const selectGitError = (state: GitStore) => state.error;
