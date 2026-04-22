import { CDP_DEFAULT_PORT, CDP_PORT, cdpEnabledForRuntime, isCdpEnabled } from './cdp';

describe('cdp helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('CDP_PORT', () => {
    it('defaults to CDP_DEFAULT_PORT', () => {
      expect(CDP_DEFAULT_PORT).toBe(9222);
      // CDP_PORT is read at module load. Assert it equals the default
      // constant instead of the literal 9222 so a pre-set
      // OMNISCRIBE_CDP_PORT in the runner env doesn't silently flip the
      // expectation.
      expect(CDP_PORT).toBe(CDP_DEFAULT_PORT);
    });

    it('falls back to the default when OMNISCRIBE_CDP_PORT is invalid', () => {
      jest.isolateModules(() => {
        process.env.OMNISCRIBE_CDP_PORT = 'not-a-number';
        const mod = jest.requireActual<typeof import('./cdp')>('./cdp');
        expect(mod.CDP_PORT).toBe(mod.CDP_DEFAULT_PORT);
      });
      jest.isolateModules(() => {
        process.env.OMNISCRIBE_CDP_PORT = '0';
        const mod = jest.requireActual<typeof import('./cdp')>('./cdp');
        expect(mod.CDP_PORT).toBe(mod.CDP_DEFAULT_PORT);
      });
      jest.isolateModules(() => {
        process.env.OMNISCRIBE_CDP_PORT = '70000';
        const mod = jest.requireActual<typeof import('./cdp')>('./cdp');
        expect(mod.CDP_PORT).toBe(mod.CDP_DEFAULT_PORT);
      });
    });

    it('accepts a valid custom port', () => {
      jest.isolateModules(() => {
        process.env.OMNISCRIBE_CDP_PORT = '9333';
        const mod = jest.requireActual<typeof import('./cdp')>('./cdp');
        expect(mod.CDP_PORT).toBe(9333);
      });
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
