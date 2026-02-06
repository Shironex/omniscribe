import type { OmniscribeHttpClient } from '../../src/http/client';

export function createMockHttpClient(): jest.Mocked<OmniscribeHttpClient> {
  return {
    reportStatus: jest.fn().mockResolvedValue(true),
  };
}
