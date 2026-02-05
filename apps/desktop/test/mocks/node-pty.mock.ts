/**
 * Mock for node-pty module
 *
 * Provides a MockPty class that simulates the IPty interface.
 * Use simulateData() and simulateExit() to trigger callbacks in tests.
 */

export class MockPty {
  pid = 1234;
  cols = 80;
  rows = 24;
  process = 'mock-shell';
  handleFlowControl = false;

  private _dataCallback: ((data: string) => void) | null = null;
  private _exitCallback: ((e: { exitCode: number; signal?: number }) => void) | null = null;

  onData = jest.fn((cb: (data: string) => void) => {
    this._dataCallback = cb;
    return { dispose: jest.fn() };
  });

  onExit = jest.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
    this._exitCallback = cb;
    return { dispose: jest.fn() };
  });

  write = jest.fn();
  resize = jest.fn();
  kill = jest.fn();
  pause = jest.fn();
  resume = jest.fn();
  clear = jest.fn();

  /** Test helper: simulate data arriving from the PTY */
  simulateData(data: string): void {
    if (this._dataCallback) {
      this._dataCallback(data);
    }
  }

  /** Test helper: simulate the PTY process exiting */
  simulateExit(exitCode: number, signal?: number): void {
    if (this._exitCallback) {
      this._exitCallback({ exitCode, signal });
    }
  }
}

/** Factory that creates a new MockPty instance for each spawn call */
export function createNodePtyMock() {
  const instances: MockPty[] = [];

  const mock = {
    spawn: jest.fn(() => {
      const instance = new MockPty();
      instances.push(instance);
      return instance;
    }),
    /** Access all created MockPty instances */
    get instances() {
      return instances;
    },
    /** Access the last created MockPty instance */
    get lastInstance() {
      return instances[instances.length - 1];
    },
  };

  return mock;
}
