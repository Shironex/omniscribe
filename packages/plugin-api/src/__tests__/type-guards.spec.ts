import { isProviderPlugin, isFrontendPlugin, isFullPlugin } from '../utils/type-guards';
import type { OmniscribePlugin } from '../types/plugin';

function makePlugin(type: string): OmniscribePlugin {
  return {
    id: 'test-plugin',
    type: type as OmniscribePlugin['type'],
    displayName: 'Test Plugin',
    activate: jest.fn().mockResolvedValue(undefined),
    deactivate: jest.fn().mockResolvedValue(undefined),
  };
}

describe('isProviderPlugin', () => {
  it('returns true for provider type', () => {
    expect(isProviderPlugin(makePlugin('provider'))).toBe(true);
  });

  it('returns true for both type', () => {
    expect(isProviderPlugin(makePlugin('both'))).toBe(true);
  });

  it('returns false for frontend type', () => {
    expect(isProviderPlugin(makePlugin('frontend'))).toBe(false);
  });
});

describe('isFrontendPlugin', () => {
  it('returns true for frontend type', () => {
    expect(isFrontendPlugin(makePlugin('frontend'))).toBe(true);
  });

  it('returns true for both type', () => {
    expect(isFrontendPlugin(makePlugin('both'))).toBe(true);
  });

  it('returns false for provider type', () => {
    expect(isFrontendPlugin(makePlugin('provider'))).toBe(false);
  });
});

describe('isFullPlugin', () => {
  it('returns true only for both type', () => {
    expect(isFullPlugin(makePlugin('both'))).toBe(true);
  });

  it('returns false for provider type', () => {
    expect(isFullPlugin(makePlugin('provider'))).toBe(false);
  });

  it('returns false for frontend type', () => {
    expect(isFullPlugin(makePlugin('frontend'))).toBe(false);
  });
});
