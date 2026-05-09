describe('ws-auth', () => {
  let initializeWsAuthToken: typeof import('./ws-auth').initializeWsAuthToken;
  let getWsAuthToken: typeof import('./ws-auth').getWsAuthToken;
  let isValidWsAuthToken: typeof import('./ws-auth').isValidWsAuthToken;
  let __resetWsAuthTokenForTests: typeof import('./ws-auth').__resetWsAuthTokenForTests;

  beforeEach(() => {
    jest.isolateModules(() => {
      const mod = require('./ws-auth') as typeof import('./ws-auth');
      initializeWsAuthToken = mod.initializeWsAuthToken;
      getWsAuthToken = mod.getWsAuthToken;
      isValidWsAuthToken = mod.isValidWsAuthToken;
      __resetWsAuthTokenForTests = mod.__resetWsAuthTokenForTests;
    });
    __resetWsAuthTokenForTests();
  });

  describe('initializeWsAuthToken', () => {
    it('returns a 64-char hex token (256 bits)', () => {
      const token = initializeWsAuthToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is idempotent — repeated calls return the same token', () => {
      const a = initializeWsAuthToken();
      const b = initializeWsAuthToken();
      expect(a).toBe(b);
    });

    it('generates a distinct token after reset (next process simulation)', () => {
      const first = initializeWsAuthToken();
      __resetWsAuthTokenForTests();
      const second = initializeWsAuthToken();
      expect(second).not.toBe(first);
    });
  });

  describe('getWsAuthToken', () => {
    it('throws before initialization', () => {
      expect(() => getWsAuthToken()).toThrow('WS auth token not initialized');
    });

    it('returns the token after initialization', () => {
      const token = initializeWsAuthToken();
      expect(getWsAuthToken()).toBe(token);
    });
  });

  describe('isValidWsAuthToken', () => {
    it('returns false before initialization', () => {
      expect(isValidWsAuthToken('anything')).toBe(false);
    });

    it('returns true for the live token', () => {
      const token = initializeWsAuthToken();
      expect(isValidWsAuthToken(token)).toBe(true);
    });

    it('returns false for a different token of the same length', () => {
      initializeWsAuthToken();
      const fake = 'a'.repeat(64);
      expect(isValidWsAuthToken(fake)).toBe(false);
    });

    it('returns false for shorter strings', () => {
      initializeWsAuthToken();
      expect(isValidWsAuthToken('short')).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      initializeWsAuthToken();
      expect(isValidWsAuthToken(undefined)).toBe(false);
      expect(isValidWsAuthToken(null)).toBe(false);
      expect(isValidWsAuthToken(12345)).toBe(false);
      expect(isValidWsAuthToken({})).toBe(false);
    });
  });
});
