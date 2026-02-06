import type { Logger } from '@omniscribe/shared';

export function createMockLogger(): jest.Mocked<Logger> {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };
}
