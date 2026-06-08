/**
 * Mock for GitStatusService
 *
 * GitDiffService depends on GitStatusService (for untracked-file lookups when
 * building diffs). Tests that exercise GitDiffService only need a thin stub of
 * the status service, so this factory provides one with sensible defaults.
 *
 * Override per test as needed, e.g.:
 *   const mock = createGitStatusServiceMock();
 *   mock.getUntrackedFiles.mockResolvedValue(['a.ts']);
 */
export function createGitStatusServiceMock() {
  return {
    getStatus: jest.fn(),
    getUntrackedFiles: jest.fn().mockResolvedValue([]),
  };
}
