/**
 * Mock for @omniscribe/shared logger
 *
 * Provides a jest-mocked Logger interface matching createLogger() output.
 */
export function createLoggerMock() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
}
