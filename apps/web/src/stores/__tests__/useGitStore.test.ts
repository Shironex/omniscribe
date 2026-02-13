import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockSocket } from '../../test/mocks/socket';
import type { BranchInfo, CommitInfo } from '@omniscribe/shared';
import { GitEvents } from '@omniscribe/shared';

vi.mock('@/lib/socket', () => ({
  socket: mockSocket,
  getSocket: vi.fn(() => mockSocket),
  initializeSocket: vi.fn(() => mockSocket),
  connectSocket: vi.fn(),
  default: mockSocket,
}));

// Mock emitAsync
const mockEmitAsync = vi.fn();
vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: (...args: unknown[]) => mockEmitAsync(...args),
}));

import {
  useGitStore,
  selectBranches,
  selectLocalBranches,
  selectRemoteBranches,
  selectCurrentBranch,
  selectCommits,
  selectBranchByName,
  selectGitLoading,
  selectGitError,
} from '../useGitStore';

// --- Helpers ---

function createBranch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: 'main',
    isRemote: false,
    isCurrent: false,
    ...overrides,
  };
}

function createCommit(overrides: Partial<CommitInfo> = {}): CommitInfo {
  return {
    hash: 'abc123def456',
    shortHash: 'abc123d',
    subject: 'Initial commit',
    authorName: 'Test Author',
    authorEmail: 'test@example.com',
    authorDate: new Date('2024-01-01'),
    committerName: 'Test Author',
    committerEmail: 'test@example.com',
    commitDate: new Date('2024-01-01'),
    parents: [],
    ...overrides,
  };
}

const initialState = {
  branches: [],
  currentBranch: null,
  commits: [],
  projectPath: null,
  isLoading: false,
  error: null,
  listenersInitialized: false,
};

// --- Tests ---

describe('useGitStore', () => {
  beforeEach(() => {
    mockSocket.__reset();
    mockEmitAsync.mockReset();
    useGitStore.setState(initialState);
  });

  afterEach(() => {
    const state = useGitStore.getState();
    if (state.listenersInitialized) {
      state.cleanupListeners();
    }
  });

  // =============================================
  // 1. Initial state
  // =============================================
  describe('initial state', () => {
    it('has empty branches', () => {
      expect(useGitStore.getState().branches).toEqual([]);
    });

    it('has null currentBranch', () => {
      expect(useGitStore.getState().currentBranch).toBeNull();
    });

    it('has empty commits', () => {
      expect(useGitStore.getState().commits).toEqual([]);
    });

    it('has null projectPath', () => {
      expect(useGitStore.getState().projectPath).toBeNull();
    });

    it('is not loading', () => {
      expect(useGitStore.getState().isLoading).toBe(false);
    });

    it('has no error', () => {
      expect(useGitStore.getState().error).toBeNull();
    });

    it('has listeners not initialized', () => {
      expect(useGitStore.getState().listenersInitialized).toBe(false);
    });
  });

  // =============================================
  // 2. Basic setters
  // =============================================
  describe('setBranches', () => {
    it('sets branches array', () => {
      const branches = [
        createBranch({ name: 'main', isCurrent: true }),
        createBranch({ name: 'feature', isCurrent: false }),
      ];
      useGitStore.getState().setBranches(branches);
      expect(useGitStore.getState().branches).toEqual(branches);
    });

    it('replaces existing branches', () => {
      useGitStore.setState({
        branches: [createBranch({ name: 'old-branch' })],
      });
      const newBranches = [createBranch({ name: 'new-branch' })];
      useGitStore.getState().setBranches(newBranches);
      expect(useGitStore.getState().branches).toHaveLength(1);
      expect(useGitStore.getState().branches[0].name).toBe('new-branch');
    });
  });

  describe('setCurrentBranch', () => {
    it('sets the current branch', () => {
      const branch = createBranch({ name: 'develop', isCurrent: true });
      useGitStore.getState().setCurrentBranch(branch);
      expect(useGitStore.getState().currentBranch).toEqual(branch);
    });

    it('sets current branch to null', () => {
      useGitStore.setState({
        currentBranch: createBranch({ name: 'main', isCurrent: true }),
      });
      useGitStore.getState().setCurrentBranch(null);
      expect(useGitStore.getState().currentBranch).toBeNull();
    });
  });

  describe('setCommits', () => {
    it('sets commits array', () => {
      const commits = [
        createCommit({ hash: 'aaa', subject: 'First' }),
        createCommit({ hash: 'bbb', subject: 'Second' }),
      ];
      useGitStore.getState().setCommits(commits);
      expect(useGitStore.getState().commits).toEqual(commits);
    });

    it('replaces existing commits', () => {
      useGitStore.setState({
        commits: [createCommit({ hash: 'old' })],
      });
      const newCommits = [createCommit({ hash: 'new' })];
      useGitStore.getState().setCommits(newCommits);
      expect(useGitStore.getState().commits).toHaveLength(1);
      expect(useGitStore.getState().commits[0].hash).toBe('new');
    });
  });

  describe('setProjectPath', () => {
    it('sets the project path', () => {
      useGitStore.getState().setProjectPath('/home/user/project');
      expect(useGitStore.getState().projectPath).toBe('/home/user/project');
    });

    it('sets project path to null', () => {
      useGitStore.setState({ projectPath: '/some/path' });
      useGitStore.getState().setProjectPath(null);
      expect(useGitStore.getState().projectPath).toBeNull();
    });
  });

  // =============================================
  // 3. clear
  // =============================================
  describe('clear', () => {
    it('resets all state to initial values', () => {
      useGitStore.setState({
        branches: [createBranch({ name: 'main' })],
        currentBranch: createBranch({ name: 'main', isCurrent: true }),
        commits: [createCommit()],
        projectPath: '/some/path',
        isLoading: true,
        error: 'some error',
      });

      useGitStore.getState().clear();

      const state = useGitStore.getState();
      expect(state.branches).toEqual([]);
      expect(state.currentBranch).toBeNull();
      expect(state.commits).toEqual([]);
      expect(state.projectPath).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // =============================================
  // 4. fetchBranches
  // =============================================
  describe('fetchBranches', () => {
    const projectPath = '/test/project';

    it('sets loading state and projectPath before fetching', async () => {
      mockEmitAsync.mockResolvedValue({ branches: [], currentBranch: null });

      const promise = useGitStore.getState().fetchBranches(projectPath);

      // isLoading should be true immediately (synchronous set before await)
      expect(useGitStore.getState().isLoading).toBe(true);
      expect(useGitStore.getState().projectPath).toBe(projectPath);
      expect(useGitStore.getState().error).toBeNull();

      await promise;
    });

    it('fetches branches successfully with BranchInfo currentBranch', async () => {
      const branches: BranchInfo[] = [
        createBranch({ name: 'main', isCurrent: true }),
        createBranch({ name: 'develop', isCurrent: false }),
      ];
      const currentBranch = createBranch({ name: 'main', isCurrent: true });

      mockEmitAsync.mockResolvedValue({ branches, currentBranch });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.branches).toEqual(branches);
      expect(state.currentBranch).toEqual(currentBranch);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('fetches branches successfully with string currentBranch that exists in branches', async () => {
      const mainBranch = createBranch({ name: 'main', isCurrent: true });
      const branches: BranchInfo[] = [
        mainBranch,
        createBranch({ name: 'feature', isCurrent: false }),
      ];

      mockEmitAsync.mockResolvedValue({ branches, currentBranch: 'main' });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.currentBranch).toEqual(mainBranch);
      expect(state.isLoading).toBe(false);
    });

    it('creates BranchInfo when string currentBranch is not in branches list', async () => {
      const branches: BranchInfo[] = [createBranch({ name: 'develop', isCurrent: false })];

      mockEmitAsync.mockResolvedValue({ branches, currentBranch: 'main' });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.currentBranch).toEqual({
        name: 'main',
        isRemote: false,
        isCurrent: true,
      });
      // Should also add to branches list
      expect(state.branches).toHaveLength(2);
      expect(state.branches.some(b => b.name === 'main')).toBe(true);
    });

    it('adds BranchInfo currentBranch to branches if not present', async () => {
      const currentBranch = createBranch({ name: 'hotfix', isCurrent: true });
      const branches: BranchInfo[] = [createBranch({ name: 'main', isCurrent: false })];

      mockEmitAsync.mockResolvedValue({ branches, currentBranch });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.branches).toHaveLength(2);
      expect(state.branches.some(b => b.name === 'hotfix')).toBe(true);
    });

    it('does not duplicate BranchInfo currentBranch when already in branches', async () => {
      const currentBranch = createBranch({ name: 'main', isCurrent: true });
      const branches: BranchInfo[] = [
        createBranch({ name: 'main', isCurrent: true }),
        createBranch({ name: 'develop', isCurrent: false }),
      ];

      mockEmitAsync.mockResolvedValue({ branches, currentBranch });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.branches).toHaveLength(2);
    });

    it('handles null currentBranch in response', async () => {
      const branches: BranchInfo[] = [createBranch({ name: 'main' })];

      mockEmitAsync.mockResolvedValue({ branches, currentBranch: null });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.branches).toEqual(branches);
      expect(state.currentBranch).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('handles undefined branches in response', async () => {
      mockEmitAsync.mockResolvedValue({ currentBranch: null });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.branches).toEqual([]);
      expect(state.isLoading).toBe(false);
    });

    it('sets error when response contains error', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'Not a git repository' });

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Not a git repository');
      expect(state.isLoading).toBe(false);
    });

    it('sets error when emitAsync throws', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Connection lost'));

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Connection lost');
      expect(state.isLoading).toBe(false);
    });

    it('sets generic error when non-Error is thrown', async () => {
      mockEmitAsync.mockRejectedValue('unexpected failure');

      await useGitStore.getState().fetchBranches(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Failed to fetch branches');
      expect(state.isLoading).toBe(false);
    });

    it('emits the correct event with correct payload', async () => {
      mockEmitAsync.mockResolvedValue({ branches: [], currentBranch: null });

      await useGitStore.getState().fetchBranches(projectPath);

      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.BRANCHES, { projectPath });
    });
  });

  // =============================================
  // 5. fetchCurrentBranch
  // =============================================
  describe('fetchCurrentBranch', () => {
    const projectPath = '/test/project';

    it('sets loading state and projectPath before fetching', async () => {
      mockEmitAsync.mockResolvedValue({ currentBranch: 'main' });

      const promise = useGitStore.getState().fetchCurrentBranch(projectPath);

      expect(useGitStore.getState().isLoading).toBe(true);
      expect(useGitStore.getState().projectPath).toBe(projectPath);
      expect(useGitStore.getState().error).toBeNull();

      await promise;
    });

    it('fetches current branch successfully', async () => {
      mockEmitAsync.mockResolvedValue({ currentBranch: 'develop' });

      await useGitStore.getState().fetchCurrentBranch(projectPath);

      const state = useGitStore.getState();
      expect(state.currentBranch).toEqual({
        name: 'develop',
        isRemote: false,
        isCurrent: true,
      });
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets currentBranch to null when response has no currentBranch', async () => {
      mockEmitAsync.mockResolvedValue({ currentBranch: null });

      await useGitStore.getState().fetchCurrentBranch(projectPath);

      expect(useGitStore.getState().currentBranch).toBeNull();
      expect(useGitStore.getState().isLoading).toBe(false);
    });

    it('sets error when response contains error', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'Git not initialized' });

      await useGitStore.getState().fetchCurrentBranch(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Git not initialized');
      expect(state.isLoading).toBe(false);
    });

    it('sets error when emitAsync throws', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Timeout'));

      await useGitStore.getState().fetchCurrentBranch(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Timeout');
      expect(state.isLoading).toBe(false);
    });

    it('sets generic error when non-Error is thrown', async () => {
      mockEmitAsync.mockRejectedValue(42);

      await useGitStore.getState().fetchCurrentBranch(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Failed to fetch current branch');
      expect(state.isLoading).toBe(false);
    });

    it('emits the correct event with correct payload', async () => {
      mockEmitAsync.mockResolvedValue({ currentBranch: 'main' });

      await useGitStore.getState().fetchCurrentBranch(projectPath);

      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.CURRENT_BRANCH, { projectPath });
    });
  });

  // =============================================
  // 6. checkout
  // =============================================
  describe('checkout', () => {
    const projectPath = '/test/project';
    const branchName = 'feature-branch';

    it('sets loading state before checkout', async () => {
      mockEmitAsync.mockResolvedValue({ success: true });

      const promise = useGitStore.getState().checkout(projectPath, branchName);

      expect(useGitStore.getState().isLoading).toBe(true);
      expect(useGitStore.getState().error).toBeNull();

      await promise;
    });

    it('succeeds and triggers refetch of branches and currentBranch', async () => {
      // First call: checkout, subsequent calls: fetchBranches and fetchCurrentBranch
      mockEmitAsync
        .mockResolvedValueOnce({ success: true }) // checkout
        .mockResolvedValueOnce({ branches: [], currentBranch: null }) // fetchBranches
        .mockResolvedValueOnce({ currentBranch: branchName }); // fetchCurrentBranch

      await useGitStore.getState().checkout(projectPath, branchName);

      const state = useGitStore.getState();
      // isLoading should be false after checkout resolves (before refetch completes loading may toggle)
      expect(state.error).toBeNull();

      // Verify checkout emitted correctly
      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.CHECKOUT, {
        projectPath,
        branch: branchName,
      });

      // Verify refetch was triggered
      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.BRANCHES, { projectPath });
      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.CURRENT_BRANCH, { projectPath });
    });

    it('sets error when response has error', async () => {
      mockEmitAsync.mockResolvedValue({
        success: false,
        error: 'Branch has uncommitted changes',
      });

      await useGitStore.getState().checkout(projectPath, branchName);

      const state = useGitStore.getState();
      expect(state.error).toBe('Branch has uncommitted changes');
      expect(state.isLoading).toBe(false);
    });

    it('sets default error when success is false but no error message', async () => {
      mockEmitAsync.mockResolvedValue({ success: false });

      await useGitStore.getState().checkout(projectPath, branchName);

      const state = useGitStore.getState();
      expect(state.error).toBe('Failed to checkout branch');
      expect(state.isLoading).toBe(false);
    });

    it('does not trigger refetch on failure', async () => {
      mockEmitAsync.mockResolvedValue({
        success: false,
        error: 'Conflict',
      });

      await useGitStore.getState().checkout(projectPath, branchName);

      // Only one call (the checkout itself), no refetch
      expect(mockEmitAsync).toHaveBeenCalledTimes(1);
    });

    it('sets error when emitAsync throws', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Network error'));

      await useGitStore.getState().checkout(projectPath, branchName);

      const state = useGitStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });

    it('sets generic error when non-Error is thrown', async () => {
      mockEmitAsync.mockRejectedValue(undefined);

      await useGitStore.getState().checkout(projectPath, branchName);

      const state = useGitStore.getState();
      expect(state.error).toBe('Failed to checkout branch');
      expect(state.isLoading).toBe(false);
    });
  });

  // =============================================
  // 7. fetchCommits
  // =============================================
  describe('fetchCommits', () => {
    const projectPath = '/test/project';

    it('sets loading state and projectPath before fetching', async () => {
      mockEmitAsync.mockResolvedValue({ commits: [] });

      const promise = useGitStore.getState().fetchCommits(projectPath);

      expect(useGitStore.getState().isLoading).toBe(true);
      expect(useGitStore.getState().projectPath).toBe(projectPath);
      expect(useGitStore.getState().error).toBeNull();

      await promise;
    });

    it('fetches commits successfully', async () => {
      const commits = [
        createCommit({ hash: 'aaa', subject: 'First commit' }),
        createCommit({ hash: 'bbb', subject: 'Second commit' }),
      ];

      mockEmitAsync.mockResolvedValue({ commits });

      await useGitStore.getState().fetchCommits(projectPath);

      const state = useGitStore.getState();
      expect(state.commits).toEqual(commits);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('uses default limit of 50', async () => {
      mockEmitAsync.mockResolvedValue({ commits: [] });

      await useGitStore.getState().fetchCommits(projectPath);

      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.COMMITS, { projectPath, limit: 50 });
    });

    it('passes custom limit', async () => {
      mockEmitAsync.mockResolvedValue({ commits: [] });

      await useGitStore.getState().fetchCommits(projectPath, 10);

      expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.COMMITS, { projectPath, limit: 10 });
    });

    it('handles undefined commits in response', async () => {
      mockEmitAsync.mockResolvedValue({});

      await useGitStore.getState().fetchCommits(projectPath);

      const state = useGitStore.getState();
      expect(state.commits).toEqual([]);
      expect(state.isLoading).toBe(false);
    });

    it('sets error when response contains error', async () => {
      mockEmitAsync.mockResolvedValue({ error: 'Failed to read git log' });

      await useGitStore.getState().fetchCommits(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Failed to read git log');
      expect(state.isLoading).toBe(false);
    });

    it('sets error when emitAsync throws', async () => {
      mockEmitAsync.mockRejectedValue(new Error('Socket disconnected'));

      await useGitStore.getState().fetchCommits(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Socket disconnected');
      expect(state.isLoading).toBe(false);
    });

    it('sets generic error when non-Error is thrown', async () => {
      mockEmitAsync.mockRejectedValue(null);

      await useGitStore.getState().fetchCommits(projectPath);

      const state = useGitStore.getState();
      expect(state.error).toBe('Failed to fetch commits');
      expect(state.isLoading).toBe(false);
    });
  });

  // =============================================
  // 8. Socket listeners
  // =============================================
  describe('socket listeners', () => {
    describe('git:branches event', () => {
      it('updates branches and currentBranch when projectPath matches', () => {
        const projectPath = '/test/project';
        useGitStore.setState({ projectPath });
        useGitStore.getState().initListeners();

        const branches: BranchInfo[] = [
          createBranch({ name: 'main', isCurrent: true }),
          createBranch({ name: 'develop', isCurrent: false }),
        ];
        const currentBranch = createBranch({ name: 'main', isCurrent: true });

        mockSocket.__simulateEvent(GitEvents.BRANCHES, {
          projectPath,
          branches,
          currentBranch,
        });

        const state = useGitStore.getState();
        expect(state.branches).toEqual(branches);
        expect(state.currentBranch).toEqual(currentBranch);
      });

      it('does not update when projectPath does not match', () => {
        const existingBranch = createBranch({ name: 'existing' });
        useGitStore.setState({
          projectPath: '/test/project-a',
          branches: [existingBranch],
        });
        useGitStore.getState().initListeners();

        mockSocket.__simulateEvent(GitEvents.BRANCHES, {
          projectPath: '/test/project-b',
          branches: [createBranch({ name: 'other' })],
          currentBranch: createBranch({ name: 'other', isCurrent: true }),
        });

        const state = useGitStore.getState();
        expect(state.branches).toEqual([existingBranch]);
      });

      it('does not update when store has no projectPath', () => {
        useGitStore.setState({ projectPath: null });
        useGitStore.getState().initListeners();

        mockSocket.__simulateEvent(GitEvents.BRANCHES, {
          projectPath: '/test/project',
          branches: [createBranch({ name: 'main' })],
          currentBranch: null,
        });

        expect(useGitStore.getState().branches).toEqual([]);
      });

      it('updates only branches when currentBranch is null in event', () => {
        const projectPath = '/test/project';
        const existingCurrentBranch = createBranch({ name: 'main', isCurrent: true });
        useGitStore.setState({
          projectPath,
          currentBranch: existingCurrentBranch,
        });
        useGitStore.getState().initListeners();

        const newBranches = [createBranch({ name: 'main' }), createBranch({ name: 'develop' })];

        mockSocket.__simulateEvent(GitEvents.BRANCHES, {
          projectPath,
          branches: newBranches,
          currentBranch: null,
        });

        const state = useGitStore.getState();
        expect(state.branches).toEqual(newBranches);
        // currentBranch should remain unchanged since the update had null
        expect(state.currentBranch).toEqual(existingCurrentBranch);
      });

      it('updates only currentBranch when branches is undefined in event', () => {
        const projectPath = '/test/project';
        const existingBranches = [createBranch({ name: 'main' })];
        useGitStore.setState({
          projectPath,
          branches: existingBranches,
        });
        useGitStore.getState().initListeners();

        const newCurrentBranch = createBranch({ name: 'develop', isCurrent: true });

        mockSocket.__simulateEvent(GitEvents.BRANCHES, {
          projectPath,
          currentBranch: newCurrentBranch,
        });

        const state = useGitStore.getState();
        // branches should remain unchanged since update had no branches
        expect(state.branches).toEqual(existingBranches);
        expect(state.currentBranch).toEqual(newCurrentBranch);
      });
    });

    describe('onConnect', () => {
      it('refetches branches, currentBranch, and commits when projectPath is set', () => {
        const projectPath = '/test/project';
        mockEmitAsync.mockResolvedValue({});

        useGitStore.setState({ projectPath });
        useGitStore.getState().initListeners();

        // Simulate the connect event
        mockSocket.__simulateEvent('connect');

        expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.BRANCHES, { projectPath });
        expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.CURRENT_BRANCH, { projectPath });
        expect(mockEmitAsync).toHaveBeenCalledWith(GitEvents.COMMITS, { projectPath, limit: 50 });
      });

      it('does not refetch when projectPath is null', () => {
        useGitStore.setState({ projectPath: null });
        useGitStore.getState().initListeners();

        mockSocket.__simulateEvent('connect');

        expect(mockEmitAsync).not.toHaveBeenCalled();
      });
    });

    describe('listener lifecycle', () => {
      it('sets listenersInitialized to true after initListeners', () => {
        useGitStore.getState().initListeners();
        expect(useGitStore.getState().listenersInitialized).toBe(true);
      });

      it('sets listenersInitialized to false after cleanupListeners', () => {
        useGitStore.getState().initListeners();
        useGitStore.getState().cleanupListeners();
        expect(useGitStore.getState().listenersInitialized).toBe(false);
      });

      it('registers socket.on handlers for git:branches and connect', () => {
        useGitStore.getState().initListeners();

        // Should have registered listeners for git:branches and connect
        expect(mockSocket.on).toHaveBeenCalledWith(GitEvents.BRANCHES, expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      });

      it('unregisters socket handlers on cleanupListeners', () => {
        useGitStore.getState().initListeners();
        useGitStore.getState().cleanupListeners();

        expect(mockSocket.off).toHaveBeenCalledWith(GitEvents.BRANCHES, expect.any(Function));
        expect(mockSocket.off).toHaveBeenCalledWith('connect', expect.any(Function));
      });
    });
  });

  // =============================================
  // 9. Selectors
  // =============================================
  describe('selectors', () => {
    const localBranch1 = createBranch({ name: 'main', isRemote: false, isCurrent: true });
    const localBranch2 = createBranch({ name: 'feature', isRemote: false, isCurrent: false });
    const remoteBranch1 = createBranch({ name: 'origin/main', isRemote: true, isCurrent: false });
    const remoteBranch2 = createBranch({
      name: 'origin/develop',
      isRemote: true,
      isCurrent: false,
    });
    const allBranches = [localBranch1, localBranch2, remoteBranch1, remoteBranch2];

    describe('selectBranches', () => {
      it('returns all branches', () => {
        useGitStore.setState({ branches: allBranches });
        expect(selectBranches(useGitStore.getState())).toEqual(allBranches);
      });

      it('returns empty array when no branches', () => {
        expect(selectBranches(useGitStore.getState())).toEqual([]);
      });
    });

    describe('selectLocalBranches', () => {
      it('returns only non-remote branches', () => {
        useGitStore.setState({ branches: allBranches });
        const result = selectLocalBranches(useGitStore.getState());
        expect(result).toEqual([localBranch1, localBranch2]);
      });

      it('returns empty array when all branches are remote', () => {
        useGitStore.setState({ branches: [remoteBranch1, remoteBranch2] });
        const result = selectLocalBranches(useGitStore.getState());
        expect(result).toEqual([]);
      });
    });

    describe('selectRemoteBranches', () => {
      it('returns only remote branches', () => {
        useGitStore.setState({ branches: allBranches });
        const result = selectRemoteBranches(useGitStore.getState());
        expect(result).toEqual([remoteBranch1, remoteBranch2]);
      });

      it('returns empty array when all branches are local', () => {
        useGitStore.setState({ branches: [localBranch1, localBranch2] });
        const result = selectRemoteBranches(useGitStore.getState());
        expect(result).toEqual([]);
      });
    });

    describe('selectCurrentBranch', () => {
      it('returns the current branch', () => {
        const branch = createBranch({ name: 'main', isCurrent: true });
        useGitStore.setState({ currentBranch: branch });
        expect(selectCurrentBranch(useGitStore.getState())).toEqual(branch);
      });

      it('returns null when no current branch', () => {
        expect(selectCurrentBranch(useGitStore.getState())).toBeNull();
      });
    });

    describe('selectCommits', () => {
      it('returns commits', () => {
        const commits = [createCommit({ hash: 'aaa' }), createCommit({ hash: 'bbb' })];
        useGitStore.setState({ commits });
        expect(selectCommits(useGitStore.getState())).toEqual(commits);
      });

      it('returns empty array when no commits', () => {
        expect(selectCommits(useGitStore.getState())).toEqual([]);
      });
    });

    describe('selectBranchByName', () => {
      it('returns the matching branch', () => {
        useGitStore.setState({ branches: allBranches });
        const selector = selectBranchByName('feature');
        expect(selector(useGitStore.getState())).toEqual(localBranch2);
      });

      it('returns undefined for non-existent branch', () => {
        useGitStore.setState({ branches: allBranches });
        const selector = selectBranchByName('non-existent');
        expect(selector(useGitStore.getState())).toBeUndefined();
      });

      it('matches remote branches by name', () => {
        useGitStore.setState({ branches: allBranches });
        const selector = selectBranchByName('origin/main');
        expect(selector(useGitStore.getState())).toEqual(remoteBranch1);
      });
    });

    describe('selectGitLoading', () => {
      it('returns true when loading', () => {
        useGitStore.setState({ isLoading: true });
        expect(selectGitLoading(useGitStore.getState())).toBe(true);
      });

      it('returns false when not loading', () => {
        expect(selectGitLoading(useGitStore.getState())).toBe(false);
      });
    });

    describe('selectGitError', () => {
      it('returns the error string', () => {
        useGitStore.setState({ error: 'Something went wrong' });
        expect(selectGitError(useGitStore.getState())).toBe('Something went wrong');
      });

      it('returns null when no error', () => {
        expect(selectGitError(useGitStore.getState())).toBeNull();
      });
    });
  });
});
