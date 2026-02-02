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
    set({ isLoading: true, error: null, projectPath });
    socket.emit('git:branches', { projectPath }, (response: { success: boolean; branches?: BranchInfo[]; error?: string }) => {
      if (response.success && response.branches) {
        set({ branches: response.branches, isLoading: false });
      } else {
        set({ error: response.error ?? 'Failed to fetch branches', isLoading: false });
      }
    });
  },

  fetchCurrentBranch: (projectPath: string) => {
    set({ isLoading: true, error: null, projectPath });
    socket.emit('git:current-branch', { projectPath }, (response: { success: boolean; branch?: BranchInfo; error?: string }) => {
      if (response.success && response.branch) {
        set({ currentBranch: response.branch, isLoading: false });
      } else {
        set({ error: response.error ?? 'Failed to fetch current branch', isLoading: false });
      }
    });
  },

  checkout: (projectPath: string, branchName: string) => {
    set({ isLoading: true, error: null });
    socket.emit('git:checkout', { projectPath, branchName }, (response: { success: boolean; error?: string }) => {
      if (response.success) {
        // Refresh branches and current branch after checkout
        get().fetchBranches(projectPath);
        get().fetchCurrentBranch(projectPath);
      } else {
        set({ error: response.error ?? 'Failed to checkout branch', isLoading: false });
      }
    });
  },

  fetchCommits: (projectPath: string, limit: number = 50) => {
    set({ isLoading: true, error: null, projectPath });
    socket.emit('git:commits', { projectPath, limit }, (response: { success: boolean; commits?: CommitInfo[]; error?: string }) => {
      if (response.success && response.commits) {
        set({ commits: response.commits, isLoading: false });
      } else {
        set({ error: response.error ?? 'Failed to fetch commits', isLoading: false });
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
