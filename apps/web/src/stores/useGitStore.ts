import { create } from 'zustand';
import { devtools } from './utils/devtools';
import {
  createLogger,
  extractErrorMessage,
  GitEvents,
  parseGitHubRepoUrl,
} from '@omniscribe/shared';
import { createMemoizedSelector } from './utils/createMemoizedSelector';
import type {
  BranchInfo,
  CommitInfo,
  GitBranchesPayload,
  GitBranchesResponse,
  GitCurrentBranchPayload,
  GitCurrentBranchResponse,
  GitCheckoutPayload,
  GitCheckoutResponse,
  GitCommitsPayload,
  GitCommitsResponse,
  GitBranchUpdateEvent,
  GitRemotesPayload,
  GitRemotesResponse,
} from '@omniscribe/shared';
import { emitAsync } from '@/lib/socketHelpers';

const logger = createLogger('GitStore');
import {
  SocketStoreState,
  SocketStoreActions,
  initialSocketState,
  createSocketActions,
  createSocketListeners,
} from './utils';

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
  /** Remote names and fetch URLs for the current project */
  remotes: Array<{ name: string; fetchUrl: string }>;
}

/**
 * Git store actions (extends common socket actions)
 */
interface GitActions extends SocketStoreActions {
  /** Fetch branches for a project */
  fetchBranches: (projectPath: string) => Promise<void>;
  /** Fetch current branch for a project */
  fetchCurrentBranch: (projectPath: string) => Promise<void>;
  /** Checkout a branch */
  checkout: (projectPath: string, branchName: string) => Promise<void>;
  /** Fetch commits for a project */
  fetchCommits: (projectPath: string, limit?: number) => Promise<void>;
  /** Fetch remotes for a project */
  fetchRemotes: (projectPath: string) => Promise<void>;
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
export const useGitStore = create<GitStore>()(
  devtools(
    (set, get) => {
      // Create common socket actions
      const socketActions = createSocketActions<GitState>(set, 'git');

      // Create socket listeners
      const { initListeners, cleanupListeners } = createSocketListeners<GitStore>(get, set, 'git', {
        listeners: [
          {
            event: GitEvents.BRANCHES,
            handler: (data, get) => {
              const update = data as GitBranchUpdateEvent;
              const currentProjectPath = get().projectPath;
              if (currentProjectPath && update.projectPath === currentProjectPath) {
                if (update.branches) {
                  get().setBranches(update.branches);
                }
                if (update.currentBranch) {
                  get().setCurrentBranch(update.currentBranch);
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
        remotes: [],

        // Common socket actions
        ...socketActions,

        // Socket listeners
        initListeners,
        cleanupListeners,

        // Custom actions
        fetchBranches: async (projectPath: string) => {
          logger.debug('fetchBranches', projectPath);
          set({ isLoading: true, error: null, projectPath }, undefined, 'git/fetchBranchesStart');
          try {
            const response = await emitAsync<GitBranchesPayload, GitBranchesResponse>(
              GitEvents.BRANCHES,
              { projectPath }
            );

            if (response.error) {
              logger.error('fetchBranches error:', response.error);
              set({ error: response.error, isLoading: false }, undefined, 'git/fetchBranchesError');
            } else {
              const branches = response.branches ?? [];

              // Handle currentBranch which can be either a string or a BranchInfo object
              let currentBranchInfo: BranchInfo | null = null;
              if (response.currentBranch) {
                if (typeof response.currentBranch === 'string') {
                  currentBranchInfo = branches.find(b => b.name === response.currentBranch) ?? null;
                  if (!currentBranchInfo) {
                    currentBranchInfo = {
                      name: response.currentBranch,
                      isRemote: false,
                      isCurrent: true,
                    };
                    if (!branches.some(b => b.name === response.currentBranch)) {
                      branches.push(currentBranchInfo);
                    }
                  }
                } else {
                  currentBranchInfo = response.currentBranch;
                  if (!branches.some(b => b.name === currentBranchInfo!.name)) {
                    branches.push(currentBranchInfo);
                  }
                }
              }

              set(
                { branches, currentBranch: currentBranchInfo, isLoading: false, error: null },
                undefined,
                'git/fetchBranches'
              );
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to fetch branches');
            logger.error('fetchBranches error:', message);
            set({ error: message, isLoading: false }, undefined, 'git/fetchBranchesError');
          }
        },

        fetchCurrentBranch: async (projectPath: string) => {
          logger.debug('fetchCurrentBranch', projectPath);
          set(
            { isLoading: true, error: null, projectPath },
            undefined,
            'git/fetchCurrentBranchStart'
          );
          try {
            const response = await emitAsync<GitCurrentBranchPayload, GitCurrentBranchResponse>(
              GitEvents.CURRENT_BRANCH,
              { projectPath }
            );

            if (response.error) {
              logger.error('fetchCurrentBranch error:', response.error);
              set(
                { error: response.error, isLoading: false },
                undefined,
                'git/fetchCurrentBranchError'
              );
            } else {
              const branchInfo: BranchInfo | null = response.currentBranch
                ? { name: response.currentBranch, isRemote: false, isCurrent: true }
                : null;
              set(
                { currentBranch: branchInfo, isLoading: false, error: null },
                undefined,
                'git/fetchCurrentBranch'
              );
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to fetch current branch');
            logger.error('fetchCurrentBranch error:', message);
            set({ error: message, isLoading: false }, undefined, 'git/fetchCurrentBranchError');
          }
        },

        checkout: async (projectPath: string, branchName: string) => {
          logger.info('Checking out', branchName, 'in', projectPath);
          set({ isLoading: true, error: null }, undefined, 'git/checkoutStart');
          try {
            const response = await emitAsync<GitCheckoutPayload, GitCheckoutResponse>(
              GitEvents.CHECKOUT,
              { projectPath, branch: branchName }
            );

            if (response.error || !response.success) {
              logger.error('Checkout error:', response.error ?? 'Failed to checkout branch');
              set(
                { error: response.error ?? 'Failed to checkout branch', isLoading: false },
                undefined,
                'git/checkoutError'
              );
            } else {
              set({ isLoading: false }, undefined, 'git/checkoutSuccess');
              get().fetchBranches(projectPath);
              get().fetchCurrentBranch(projectPath);
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to checkout branch');
            logger.error('checkout error:', message);
            set({ error: message, isLoading: false }, undefined, 'git/checkoutError');
          }
        },

        fetchCommits: async (projectPath: string, limit: number = 50) => {
          logger.debug('fetchCommits', projectPath, 'limit:', limit);
          set({ isLoading: true, error: null, projectPath }, undefined, 'git/fetchCommitsStart');
          try {
            const response = await emitAsync<GitCommitsPayload, GitCommitsResponse>(
              GitEvents.COMMITS,
              { projectPath, limit }
            );

            if (response.error) {
              logger.error('fetchCommits error:', response.error);
              set({ error: response.error, isLoading: false }, undefined, 'git/fetchCommitsError');
            } else {
              set(
                { commits: response.commits ?? [], isLoading: false, error: null },
                undefined,
                'git/fetchCommits'
              );
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to fetch commits');
            logger.error('fetchCommits error:', message);
            set({ error: message, isLoading: false }, undefined, 'git/fetchCommitsError');
          }
        },

        setBranches: (branches: BranchInfo[]) => {
          set({ branches }, undefined, 'git/setBranches');
        },

        setCurrentBranch: (branch: BranchInfo | null) => {
          set({ currentBranch: branch }, undefined, 'git/setCurrentBranch');
        },

        setCommits: (commits: CommitInfo[]) => {
          set({ commits }, undefined, 'git/setCommits');
        },

        setProjectPath: (projectPath: string | null) => {
          set({ projectPath }, undefined, 'git/setProjectPath');
        },

        fetchRemotes: async (projectPath: string) => {
          logger.debug('fetchRemotes', projectPath);
          try {
            const response = await emitAsync<GitRemotesPayload, GitRemotesResponse>(
              GitEvents.REMOTES,
              { projectPath }
            );

            if (!response.error) {
              set({ remotes: response.remotes ?? [] }, undefined, 'git/fetchRemotes');
            }
          } catch (err) {
            const message = extractErrorMessage(err, 'Failed to fetch remotes');
            logger.error('fetchRemotes error:', message);
            // Non-fatal — do not surface error to user
          }
        },

        clear: () => {
          set(
            {
              branches: [],
              currentBranch: null,
              commits: [],
              projectPath: null,
              remotes: [],
              isLoading: false,
              error: null,
            },
            undefined,
            'git/clear'
          );
        },
      };
    },
    { name: 'git' }
  )
);

// Selectors

/**
 * Select all branches
 */
export const selectBranches = (state: GitStore) => state.branches;

/**
 * Select local branches only (memoized for stable references)
 */
export const selectLocalBranches = createMemoizedSelector((state: GitStore) =>
  state.branches.filter(branch => !branch.isRemote)
);

/**
 * Select remote branches only (memoized for stable references)
 */
export const selectRemoteBranches = createMemoizedSelector((state: GitStore) =>
  state.branches.filter(branch => branch.isRemote)
);

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

/**
 * Select the GitHub HTTPS URL for the active project, or null if the project
 * has no GitHub remote. Prefers 'origin'; falls back to the first parseable
 * GitHub remote.
 */
export const selectGitHubUrl = createMemoizedSelector((state: GitStore): string | null => {
  const { remotes } = state;
  if (!remotes.length) return null;

  const origin = remotes.find(r => r.name === 'origin');
  const candidates = origin ? [origin, ...remotes.filter(r => r.name !== 'origin')] : remotes;

  for (const remote of candidates) {
    const parsed = parseGitHubRepoUrl(remote.fetchUrl);
    if (parsed) return parsed.httpsUrl;
  }

  return null;
});
