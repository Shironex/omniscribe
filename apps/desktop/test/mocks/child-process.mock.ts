/**
 * Mock for child_process module
 *
 * Provides a mockable exec function that works with promisify(exec),
 * which is how GitBaseService uses it.
 *
 * The mock exec function returns a Promise<{stdout, stderr}> when called
 * with (command, options) — this matches the promisified form.
 */

export interface ExecMockResult {
  stdout: string;
  stderr: string;
}

/**
 * Creates a mock exec function compatible with promisify(exec).
 *
 * The returned mock can be configured:
 * - mockExec.mockResolvedValue({ stdout: '...', stderr: '' })
 * - mockExec.mockRejectedValue(new Error('...'))
 * - mockExec.mockImplementation((cmd, opts) => Promise.resolve({...}))
 */
export function createExecMock() {
  const mockExec = jest.fn<Promise<ExecMockResult>, [string, Record<string, unknown>?]>();

  // Default: resolve with empty output
  mockExec.mockResolvedValue({ stdout: '', stderr: '' });

  return mockExec;
}

/**
 * Creates a complete child_process module mock.
 * The exec mock is already promisify-compatible (returns a Promise).
 */
export function createChildProcessMock() {
  const execMock = createExecMock();

  return {
    exec: execMock,
    execSync: jest.fn(),
    execFileSync: jest.fn(),
    /** Direct access to the mock for test assertions */
    __execMock: execMock,
  };
}
