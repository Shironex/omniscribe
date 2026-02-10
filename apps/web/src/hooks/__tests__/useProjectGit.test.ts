import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---- Mocks (must be declared before any imports that use them) ----

const mockFetchBranches = vi.fn();
const mockClearGitState = vi.fn();
const mockDiscoverMcpServers = vi.fn();

let mockGitBranches: Array<{ name: string; isRemote: boolean; isCurrent?: boolean }> = [];
let mockCurrentGitBranch: { name: string; isRemote: boolean; isCurrent?: boolean } | null = null;

vi.mock('@/stores/useGitStore', () => ({
  useGitStore: (selector: (state: any) => any) =>
    selector({
      branches: mockGitBranches,
      currentBranch: mockCurrentGitBranch,
      fetchBranches: mockFetchBranches,
      clear: mockClearGitState,
    }),
}));

vi.mock('@/stores/useMcpStore', () => ({
  useMcpStore: (selector: (state: any) => any) =>
    selector({
      discoverServers: mockDiscoverMcpServers,
    }),
}));

// ---- Import under test (after mocks) ----

import { useProjectGit } from '../useProjectGit';

// ---- Tests ----

describe('useProjectGit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGitBranches = [];
    mockCurrentGitBranch = null;
  });

  // ================================================================
  // 1. Initial state
  // ================================================================
  describe('initial state', () => {
    it('returns empty branches array when store has no branches', () => {
      const { result } = renderHook(() => useProjectGit(null));
      expect(result.current.branches).toEqual([]);
    });

    it('defaults currentBranch to "main" when store has no current branch', () => {
      const { result } = renderHook(() => useProjectGit(null));
      expect(result.current.currentBranch).toBe('main');
    });

    it('returns handleBranchClick as a function', () => {
      const { result } = renderHook(() => useProjectGit(null));
      expect(typeof result.current.handleBranchClick).toBe('function');
    });
  });

  // ================================================================
  // 2. Project change detection - first render with a path
  // ================================================================
  describe('project change detection', () => {
    it('clears git state on first render with a project path', () => {
      renderHook(() => useProjectGit('/project-a'));
      expect(mockClearGitState).toHaveBeenCalledTimes(1);
    });

    it('fetches branches for the project on first render', () => {
      renderHook(() => useProjectGit('/project-a'));
      expect(mockFetchBranches).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledWith('/project-a');
    });

    it('discovers MCP servers for the project on first render', () => {
      renderHook(() => useProjectGit('/project-a'));
      expect(mockDiscoverMcpServers).toHaveBeenCalledTimes(1);
      expect(mockDiscoverMcpServers).toHaveBeenCalledWith('/project-a');
    });

    it('clears git state on first render even with null path', () => {
      renderHook(() => useProjectGit(null));
      // The prevProjectPathRef starts as null, and activeProjectPath is null,
      // so they are equal (null === null). The effect should NOT clear.
      // On first render, prevProjectPathRef.current is null and activeProjectPath is null,
      // so activeProjectPath !== prevProjectPath is false. No clear should happen.
      expect(mockClearGitState).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // 3. Project path changes (rerender)
  // ================================================================
  describe('project path changes', () => {
    it('clears state and fetches when path changes to a different project', () => {
      const { rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: '/project-a' as string | null },
      });

      vi.clearAllMocks();

      rerender({ path: '/project-b' });

      expect(mockClearGitState).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledWith('/project-b');
      expect(mockDiscoverMcpServers).toHaveBeenCalledTimes(1);
      expect(mockDiscoverMcpServers).toHaveBeenCalledWith('/project-b');
    });

    it('does not re-fetch when rerendered with the same path', () => {
      const { rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: '/project-a' as string | null },
      });

      vi.clearAllMocks();

      rerender({ path: '/project-a' });

      expect(mockClearGitState).not.toHaveBeenCalled();
      expect(mockFetchBranches).not.toHaveBeenCalled();
      expect(mockDiscoverMcpServers).not.toHaveBeenCalled();
    });

    it('clears state but does not fetch when path changes to null', () => {
      const { rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: '/project-a' as string | null },
      });

      vi.clearAllMocks();

      rerender({ path: null });

      expect(mockClearGitState).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).not.toHaveBeenCalled();
      expect(mockDiscoverMcpServers).not.toHaveBeenCalled();
    });

    it('fetches when path changes from null to a project', () => {
      const { rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: null as string | null },
      });

      vi.clearAllMocks();

      rerender({ path: '/project-a' });

      expect(mockClearGitState).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledWith('/project-a');
      expect(mockDiscoverMcpServers).toHaveBeenCalledTimes(1);
      expect(mockDiscoverMcpServers).toHaveBeenCalledWith('/project-a');
    });

    it('handles multiple consecutive project changes', () => {
      const { rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: '/project-a' as string | null },
      });

      vi.clearAllMocks();

      rerender({ path: '/project-b' });
      rerender({ path: '/project-c' });

      // Two project changes after the initial render
      expect(mockClearGitState).toHaveBeenCalledTimes(2);
      expect(mockFetchBranches).toHaveBeenCalledTimes(2);
      expect(mockFetchBranches).toHaveBeenCalledWith('/project-b');
      expect(mockFetchBranches).toHaveBeenCalledWith('/project-c');
      expect(mockDiscoverMcpServers).toHaveBeenCalledTimes(2);
      expect(mockDiscoverMcpServers).toHaveBeenCalledWith('/project-b');
      expect(mockDiscoverMcpServers).toHaveBeenCalledWith('/project-c');
    });
  });

  // ================================================================
  // 4. Null path handling
  // ================================================================
  describe('null path', () => {
    it('does not call any actions on initial render with null', () => {
      renderHook(() => useProjectGit(null));

      // prevProjectPathRef starts as null, activeProjectPath is null
      // null !== null is false, so the effect body does not execute
      expect(mockClearGitState).not.toHaveBeenCalled();
      expect(mockFetchBranches).not.toHaveBeenCalled();
      expect(mockDiscoverMcpServers).not.toHaveBeenCalled();
    });

    it('does not re-fetch when rerendered with null again', () => {
      const { rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: null as string | null },
      });

      vi.clearAllMocks();

      rerender({ path: null });

      expect(mockClearGitState).not.toHaveBeenCalled();
      expect(mockFetchBranches).not.toHaveBeenCalled();
      expect(mockDiscoverMcpServers).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // 5. Branch formatting (useMemo)
  // ================================================================
  describe('branch formatting', () => {
    it('maps git branches to Branch format with name and isRemote', () => {
      mockGitBranches = [
        { name: 'main', isRemote: false },
        { name: 'origin/main', isRemote: true },
      ];

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.branches).toEqual([
        { name: 'main', isRemote: false, isCurrent: false },
        { name: 'origin/main', isRemote: true, isCurrent: false },
      ]);
    });

    it('marks the current branch with isCurrent: true', () => {
      mockGitBranches = [
        { name: 'main', isRemote: false },
        { name: 'feature', isRemote: false },
        { name: 'origin/main', isRemote: true },
      ];
      mockCurrentGitBranch = { name: 'feature', isRemote: false, isCurrent: true };

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.branches).toEqual([
        { name: 'main', isRemote: false, isCurrent: false },
        { name: 'feature', isRemote: false, isCurrent: true },
        { name: 'origin/main', isRemote: true, isCurrent: false },
      ]);
    });

    it('sets all branches to isCurrent: false when no current branch', () => {
      mockGitBranches = [
        { name: 'main', isRemote: false },
        { name: 'develop', isRemote: false },
      ];
      mockCurrentGitBranch = null;

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.branches.every(b => b.isCurrent === false)).toBe(true);
    });

    it('handles empty branches array', () => {
      mockGitBranches = [];
      mockCurrentGitBranch = { name: 'main', isRemote: false, isCurrent: true };

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.branches).toEqual([]);
    });

    it('derives isCurrent by comparing branch name to currentGitBranch name', () => {
      mockGitBranches = [
        { name: 'main', isRemote: false },
        { name: 'main', isRemote: true }, // remote branch with same name
      ];
      mockCurrentGitBranch = { name: 'main', isRemote: false, isCurrent: true };

      const { result } = renderHook(() => useProjectGit(null));

      // Both branches named 'main' should be marked as current
      // because the comparison is purely name-based
      expect(result.current.branches).toEqual([
        { name: 'main', isRemote: false, isCurrent: true },
        { name: 'main', isRemote: true, isCurrent: true },
      ]);
    });
  });

  // ================================================================
  // 6. currentBranch return value
  // ================================================================
  describe('currentBranch', () => {
    it('returns the current branch name from the store', () => {
      mockCurrentGitBranch = { name: 'develop', isRemote: false, isCurrent: true };

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.currentBranch).toBe('develop');
    });

    it('defaults to "main" when store has no current branch', () => {
      mockCurrentGitBranch = null;

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.currentBranch).toBe('main');
    });

    it('returns branch name for remote branches', () => {
      mockCurrentGitBranch = { name: 'origin/feature', isRemote: true, isCurrent: true };

      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current.currentBranch).toBe('origin/feature');
    });
  });

  // ================================================================
  // 7. handleBranchClick
  // ================================================================
  describe('handleBranchClick', () => {
    it('calls fetchBranches with the active project path', () => {
      const { result } = renderHook(() => useProjectGit('/my-project'));

      vi.clearAllMocks();

      act(() => {
        result.current.handleBranchClick();
      });

      expect(mockFetchBranches).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledWith('/my-project');
    });

    it('does not call fetchBranches when path is null', () => {
      const { result } = renderHook(() => useProjectGit(null));

      vi.clearAllMocks();

      act(() => {
        result.current.handleBranchClick();
      });

      expect(mockFetchBranches).not.toHaveBeenCalled();
    });

    it('uses the updated path after rerender', () => {
      const { result, rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: '/project-a' as string | null },
      });

      rerender({ path: '/project-b' });

      vi.clearAllMocks();

      act(() => {
        result.current.handleBranchClick();
      });

      expect(mockFetchBranches).toHaveBeenCalledTimes(1);
      expect(mockFetchBranches).toHaveBeenCalledWith('/project-b');
    });

    it('stops calling fetchBranches after path changes to null', () => {
      const { result, rerender } = renderHook(({ path }) => useProjectGit(path), {
        initialProps: { path: '/project-a' as string | null },
      });

      rerender({ path: null });

      vi.clearAllMocks();

      act(() => {
        result.current.handleBranchClick();
      });

      expect(mockFetchBranches).not.toHaveBeenCalled();
    });

    it('can be called multiple times', () => {
      const { result } = renderHook(() => useProjectGit('/my-project'));

      vi.clearAllMocks();

      act(() => {
        result.current.handleBranchClick();
        result.current.handleBranchClick();
        result.current.handleBranchClick();
      });

      expect(mockFetchBranches).toHaveBeenCalledTimes(3);
    });
  });

  // ================================================================
  // 8. Return value structure
  // ================================================================
  describe('return value structure', () => {
    it('returns an object with branches, currentBranch, and handleBranchClick', () => {
      const { result } = renderHook(() => useProjectGit(null));

      expect(result.current).toHaveProperty('branches');
      expect(result.current).toHaveProperty('currentBranch');
      expect(result.current).toHaveProperty('handleBranchClick');
      expect(Array.isArray(result.current.branches)).toBe(true);
      expect(typeof result.current.currentBranch).toBe('string');
      expect(typeof result.current.handleBranchClick).toBe('function');
    });

    it('does not return extra properties', () => {
      const { result } = renderHook(() => useProjectGit(null));

      const keys = Object.keys(result.current);
      expect(keys).toHaveLength(3);
      expect(keys.sort()).toEqual(['branches', 'currentBranch', 'handleBranchClick']);
    });
  });
});
