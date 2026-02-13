import { ALLOWED_ORIGINS, CORS_CONFIG, isOriginAllowed, corsOriginCallback } from './cors.config';

describe('cors.config', () => {
  describe('ALLOWED_ORIGINS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(ALLOWED_ORIGINS)).toBe(true);
      expect(ALLOWED_ORIGINS.length).toBeGreaterThan(0);
    });

    it('should contain RegExp patterns for localhost', () => {
      const regexps = ALLOWED_ORIGINS.filter(o => o instanceof RegExp);
      expect(regexps.length).toBeGreaterThanOrEqual(2);

      // Verify localhost patterns match any port
      const localhostRegex = regexps.find(r => r.test('http://localhost:3001'));
      const ipRegex = regexps.find(r => r.test('http://127.0.0.1:3001'));
      expect(localhostRegex).toBeDefined();
      expect(ipRegex).toBeDefined();
    });

    it('should contain RegExp patterns for Electron protocols', () => {
      const regexps = ALLOWED_ORIGINS.filter(o => o instanceof RegExp);

      const appRegex = regexps.find(r => r.test('app://something'));
      const fileRegex = regexps.find(r => r.test('file://something'));
      expect(appRegex).toBeDefined();
      expect(fileRegex).toBeDefined();
    });
  });

  describe('CORS_CONFIG', () => {
    it('should have origin set to ALLOWED_ORIGINS', () => {
      expect(CORS_CONFIG.origin).toBe(ALLOWED_ORIGINS);
    });

    it('should have credentials set to true', () => {
      expect(CORS_CONFIG.credentials).toBe(true);
    });
  });

  describe('isOriginAllowed', () => {
    it('should return true for undefined origin (same-origin requests)', () => {
      expect(isOriginAllowed(undefined)).toBe(true);
    });

    it('should return true for any localhost port', () => {
      expect(isOriginAllowed('http://localhost:5173')).toBe(true);
      expect(isOriginAllowed('http://localhost:3001')).toBe(true);
      expect(isOriginAllowed('http://localhost:9999')).toBe(true);
      expect(isOriginAllowed('http://localhost:15174')).toBe(true);
    });

    it('should return true for any 127.0.0.1 port', () => {
      expect(isOriginAllowed('http://127.0.0.1:5173')).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:3001')).toBe(true);
      expect(isOriginAllowed('http://127.0.0.1:8080')).toBe(true);
    });

    it('should return true for app:// protocol origins', () => {
      expect(isOriginAllowed('app://.')).toBe(true);
      expect(isOriginAllowed('app://electron')).toBe(true);
    });

    it('should return true for file:// protocol origins', () => {
      expect(isOriginAllowed('file://')).toBe(true);
      expect(isOriginAllowed('file:///path/to/index.html')).toBe(true);
    });

    it('should return false for localhost without a port', () => {
      expect(isOriginAllowed('http://localhost')).toBe(false);
      expect(isOriginAllowed('http://127.0.0.1')).toBe(false);
    });

    it('should return false for disallowed origins', () => {
      expect(isOriginAllowed('http://evil.com')).toBe(false);
      expect(isOriginAllowed('https://malicious-site.example.com')).toBe(false);
    });

    it('should return false for localhost with path (not a valid origin)', () => {
      expect(isOriginAllowed('http://localhost:3001/api')).toBe(false);
    });

    it('should return true for empty string origin (falsy, same as undefined)', () => {
      // Empty string is falsy so it falls through the !origin guard
      expect(isOriginAllowed('')).toBe(true);
    });
  });

  describe('corsOriginCallback', () => {
    it('should call callback(null, true) for allowed origins', () => {
      const callback = jest.fn();

      corsOriginCallback('http://localhost:5173', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should call callback(null, true) for undefined origin', () => {
      const callback = jest.fn();

      corsOriginCallback(undefined, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should call callback(Error) for disallowed origins', () => {
      const callback = jest.fn();

      corsOriginCallback('http://evil.com', callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const errorArg = callback.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe('Not allowed by CORS');
    });

    it('should call callback(null, true) for any localhost port', () => {
      const callback = jest.fn();

      corsOriginCallback('http://localhost:9999', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should call callback(null, true) for app:// protocol', () => {
      const callback = jest.fn();

      corsOriginCallback('app://electron', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should call callback(null, true) for file:// protocol', () => {
      const callback = jest.fn();

      corsOriginCallback('file:///index.html', callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });
});
