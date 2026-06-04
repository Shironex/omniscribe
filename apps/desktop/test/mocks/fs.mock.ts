/**
 * Mock for the Node `fs` module
 *
 * Only the synchronous calls the backend uses for corrupt-store recovery are
 * stubbed (existsSync / copyFileSync). Because `jest.mock` is hoisted above
 * imports, consume this from inside the factory callback:
 *
 *   jest.mock('fs', () => require('../../../test/mocks/fs.mock').createFsMock());
 *
 * Then assert/configure via the typed handle:
 *   const mockedFs = fs as jest.Mocked<typeof fs>;
 *   mockedFs.existsSync.mockReturnValue(true);
 */
export function createFsMock() {
  return {
    existsSync: jest.fn(() => false),
    copyFileSync: jest.fn(),
  };
}
