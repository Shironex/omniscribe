import { create } from 'zustand';
import { BranchInfo, CommitInfo } from '@omniscribe/shared';
import { socket } from '../lib/socket';

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
 * Git store state
 */
interface GitState {
  /** All branches for the current project */
  branches: BranchInfo[];
  /** Current branch */
  currentBranch: BranchInfo | null;
  /** Recent commits */
  commits: CommitInfo[];
  /** Current project path being tracked */
  projectPath: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Whether listeners are initialized */
  listenersInitialized: boolean;
}

/**
 * Git store actions
 */
interface GitActions {
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
  /** Set loading state */
  setLoading: (isLoading: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
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
export const useGitStore = create<GitStore>((set, get) => ({
  // Initial state
  branches: [],
  currentBranch: null,
  commits: [],
  projectPath: null,
  isLoading: false,
  error: null,
  listenersInitialized: false,

  // Actions
  fetchBranches: (projectPath: string) => {
    console.log('[GitStore] fetchBranches called for:', projectPath);
    set({ isLoading: true, error: null, projectPath });
    socket.emit('git:branches', { projectPath }, (response: { branches: BranchInfo[]; currentBranch: string | BranchInfo; error?: string }) => {
      console.log('[GitStore] fetchBranches response:', response);
      // Backend returns { branches, currentBranch, error? } - no success field
      if (response.error) {
        console.error('[GitStore] fetchBranches error:', response.error);
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
              currentBranchInfo = { name: response.currentBranch, isRemote: false, isCurrent: true };
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

        console.log('[GitStore] Setting branches:', branches.length, 'currentBranch:', currentBranchInfo?.name);
        set({ branches, currentBranch: currentBranchInfo, isLoading: false, error: null });
      }
    });
  },

  fetchCurrentBranch: (projectPath: string) => {
    set({ isLoading: true, error: null, projectPath });
    socket.emit('git:current-branch', { projectPath }, (response: { currentBranch: string; error?: string }) => {
      // Backend returns { currentBranch: string, error? } - no success field, no BranchInfo
      if (response.error) {
        set({ error: response.error, isLoading: false });
      } else {
        // Create a minimal BranchInfo from the branch name
        const branchInfo: BranchInfo | null = response.currentBranch
          ? { name: response.currentBranch, isRemote: false, isCurrent: true }
          : null;
        set({ currentBranch: branchInfo, isLoading: false, error: null });
      }
    });
  },

  checkout: (projectPath: string, branchName: string) => {
    set({ isLoading: true, error: null });
    socket.emit('git:checkout', { projectPath, branch: branchName }, (response: { success: boolean; currentBranch?: string; error?: string }) => {
      // Backend returns { success, currentBranch?, error? }
      if (response.error || !response.success) {
        set({ error: response.error ?? 'Failed to checkout branch', isLoading: false });
      } else {
        // Refresh branches and current branch after checkout
        get().fetchBranches(projectPath);
        get().fetchCurrentBranch(projectPath);
      }
    });
  },

  fetchCommits: (projectPath: string, limit: number = 50) => {
    set({ isLoading: true, error: null, projectPath });
    socket.emit('git:commits', { projectPath, limit }, (response: { commits: CommitInfo[]; error?: string }) => {
      // Backend returns { commits, error? } - no success field
      if (response.error) {
        set({ error: response.error, isLoading: false });
      } else {
        set({ commits: response.commits ?? [], isLoading: false, error: null });
      }
    });
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

  setLoading: (isLoading: boolean) => {
    set({ isLoading });
  },

  setError: (error: string | null) => {
    set({ error });
  },

  initListeners: () => {
    const state = get();

    // Prevent duplicate listener registration
    if (state.listenersInitialized) {
      return;
    }

    const { setBranches, setCurrentBranch, setCommits, setError } = get();

    // Handle branch updates
    socket.on('git:branches:updated', (update: GitBranchUpdate) => {
      const currentProjectPath = get().projectPath;
      if (currentProjectPath && update.projectPath === currentProjectPath) {
        setBranches(update.branches);
        if (update.currentBranch) {
          setCurrentBranch(update.currentBranch);
        }
      }
    });

    // Handle commits updates
    socket.on('git:commits:updated', (update: GitCommitsUpdate) => {
      const currentProjectPath = get().projectPath;
      if (currentProjectPath && update.projectPath === currentProjectPath) {
        setCommits(update.commits);
      }
    });

    // Handle checkout result
    socket.on('git:checkout:result', (result: GitCheckoutResult) => {
      const currentProjectPath = get().projectPath;
      if (currentProjectPath && result.projectPath === currentProjectPath) {
        if (!result.success && result.error) {
          setError(result.error);
        }
      }
    });

    // Handle connection error
    socket.on('connect_error', (err: Error) => {
      setError(`Connection error: ${err.message}`);
    });

    // Handle reconnection - refresh git data
    socket.on('connect', () => {
      setError(null);
      const currentProjectPath = get().projectPath;
      if (currentProjectPath) {
        get().fetchBranches(currentProjectPath);
        get().fetchCurrentBranch(currentProjectPath);
        get().fetchCommits(currentProjectPath);
      }
    });

    set({ listenersInitialized: true });
  },

  cleanupListeners: () => {
    socket.off('git:branches:updated');
    socket.off('git:commits:updated');
    socket.off('git:checkout:result');

    set({ listenersInitialized: false });
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
}));

// Selectors

/**
 * Select all branches
 */
export const selectBranches = (state: GitStore) => state.branches;

/**
 * Select local branches only
 */
export const selectLocalBranches = (state: GitStore) =>
  state.branches.filter((branch) => !branch.isRemote);

/**
 * Select remote branches only
 */
export const selectRemoteBranches = (state: GitStore) =>
  state.branches.filter((branch) => branch.isRemote);

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
  state.branches.find((branch) => branch.name === name);

/**
 * Select loading state
 */
export const selectGitLoading = (state: GitStore) => state.isLoading;

/**
 * Select error
 */
export const selectGitError = (state: GitStore) => state.error;
