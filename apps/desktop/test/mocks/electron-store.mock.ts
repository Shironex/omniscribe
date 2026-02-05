/**
 * Mock for electron-store module
 *
 * Provides an in-memory Map-backed Store class that matches
 * the electron-store constructor API: new Store({ name, defaults })
 */

export class MockStore {
  private data: Map<string, unknown>;
  readonly path = '/mock/store/path.json';

  constructor(options?: { name?: string; defaults?: Record<string, unknown> }) {
    this.data = new Map();
    if (options?.defaults) {
      for (const [key, value] of Object.entries(options.defaults)) {
        this.data.set(key, structuredClone(value));
      }
    }
  }

  get<T>(key: string, defaultValue?: T): T {
    if (this.data.has(key)) {
      return structuredClone(this.data.get(key)) as T;
    }
    return defaultValue as T;
  }

  set(key: string, value: unknown): void {
    this.data.set(key, structuredClone(value));
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * Creates a jest.mock factory for electron-store.
 * Usage: jest.mock('electron-store', () => createElectronStoreMock());
 */
export function createElectronStoreMock() {
  return {
    __esModule: true,
    default: MockStore,
  };
}
