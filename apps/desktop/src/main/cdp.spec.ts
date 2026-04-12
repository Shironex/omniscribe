import { CDP_DEFAULT_PORT, CDP_PORT, cdpEnabledForRuntime, isCdpEnabled } from './cdp';

describe('cdp helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('CDP_PORT', () => {
    it('defaults to 9222', () => {
      expect(CDP_DEFAULT_PORT).toBe(9222);
      // CDP_PORT is read at module load — in the test env no OMNISCRIBE_CDP_PORT
      // is set, so it must fall back to the default.
      expect(CDP_PORT).toBe(9222);
    });
  });

  describe('isCdpEnabled', () => {
    it('returns true when OMNISCRIBE_ENABLE_CDP=1', () => {
      process.env.OMNISCRIBE_ENABLE_CDP = '1';
      expect(isCdpEnabled()).toBe(true);
    });

    it('returns false when OMNISCRIBE_ENABLE_CDP is unset', () => {
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      expect(isCdpEnabled()).toBe(false);
    });

    it('returns false when OMNISCRIBE_ENABLE_CDP is not "1"', () => {
      process.env.OMNISCRIBE_ENABLE_CDP = 'true';
      expect(isCdpEnabled()).toBe(false);
    });
  });

  describe('cdpEnabledForRuntime', () => {
    it('env override enables regardless of packaged state', () => {
      process.env.OMNISCRIBE_ENABLE_CDP = '1';
      process.env.NODE_ENV = 'production';
      expect(cdpEnabledForRuntime(true)).toBe(true);
      expect(cdpEnabledForRuntime(false)).toBe(true);
    });

    it('packaged build without env override is disabled', () => {
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      process.env.NODE_ENV = 'development';
      expect(cdpEnabledForRuntime(true)).toBe(false);
    });

    it('unpackaged + NODE_ENV=development is disabled without env override', () => {
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      process.env.NODE_ENV = 'development';
      expect(cdpEnabledForRuntime(false)).toBe(false);
    });

    it('unpackaged + NODE_ENV=production is disabled', () => {
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      process.env.NODE_ENV = 'production';
      expect(cdpEnabledForRuntime(false)).toBe(false);
    });

    it('packaged + NODE_ENV=development + env override is enabled', () => {
      process.env.OMNISCRIBE_ENABLE_CDP = '1';
      process.env.NODE_ENV = 'development';
      expect(cdpEnabledForRuntime(true)).toBe(true);
    });
  });
});
