import { ALLOWED_ORIGINS, CORS_CONFIG, isOriginAllowed, corsOriginCallback } from './cors.config';
import { VITE_DEV_PORT } from '@omniscribe/shared';

describe('cors.config', () => {
  describe('ALLOWED_ORIGINS', () => {
    it('lists exactly the Vite dev origins (no wildcard ports)', () => {
      expect([...ALLOWED_ORIGINS]).toEqual([
        `http://localhost:${VITE_DEV_PORT}`,
        `http://127.0.0.1:${VITE_DEV_PORT}`,
      ]);
    });
  });

  describe('CORS_CONFIG', () => {
    it('uses a callback-style origin so the same allowlist drives WS + HTTP', () => {
      expect(typeof CORS_CONFIG.origin).toBe('function');
    });

    it('has credentials set to true', () => {
      expect(CORS_CONFIG.credentials).toBe(true);
    });
  });

  describe('isOriginAllowed', () => {
    it('returns true for undefined origin (same-origin / Electron-internal)', () => {
      expect(isOriginAllowed(undefined)).toBe(true);
    });

    it('returns true only for the Vite dev port', () => {
      expect(isOriginAllowed(`http://localhost:${VITE_DEV_PORT}`)).toBe(true);
      expect(isOriginAllowed(`http://127.0.0.1:${VITE_DEV_PORT}`)).toBe(true);
    });

    it('rejects other localhost ports (the old regex over-allowed)', () => {
      expect(isOriginAllowed('http://localhost:3000')).toBe(false);
      expect(isOriginAllowed('http://localhost:5173')).toBe(false);
      expect(isOriginAllowed('http://127.0.0.1:9999')).toBe(false);
    });

    it('returns true for app:// and file:// protocols', () => {
      expect(isOriginAllowed('app://.')).toBe(true);
      expect(isOriginAllowed('app://electron')).toBe(true);
      expect(isOriginAllowed('file://')).toBe(true);
      expect(isOriginAllowed('file:///path/to/index.html')).toBe(true);
    });

    it('rejects bare localhost without port', () => {
      expect(isOriginAllowed('http://localhost')).toBe(false);
      expect(isOriginAllowed('http://127.0.0.1')).toBe(false);
    });

    it('rejects unrelated origins', () => {
      expect(isOriginAllowed('http://evil.com')).toBe(false);
      expect(isOriginAllowed('https://malicious-site.example.com')).toBe(false);
    });

    it('rejects an allowed-host suffix with a path appended', () => {
      // Real `Origin` headers never contain a path, but be defensive.
      expect(isOriginAllowed(`http://localhost:${VITE_DEV_PORT}/api`)).toBe(false);
    });

    it('treats empty string like undefined (same-origin)', () => {
      expect(isOriginAllowed('')).toBe(true);
    });
  });

  describe('corsOriginCallback', () => {
    it('allows the Vite dev origin', () => {
      const callback = jest.fn();
      corsOriginCallback(`http://localhost:${VITE_DEV_PORT}`, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows undefined origin (no Origin header)', () => {
      const callback = jest.fn();
      corsOriginCallback(undefined, callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('rejects disallowed origins', () => {
      const callback = jest.fn();
      corsOriginCallback('http://evil.com', callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const errorArg = callback.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(Error);
      expect(errorArg.message).toBe('Not allowed by CORS');
    });

    it('rejects arbitrary localhost ports', () => {
      const callback = jest.fn();
      corsOriginCallback('http://localhost:9999', callback);
      expect(callback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('allows app:// protocol', () => {
      const callback = jest.fn();
      corsOriginCallback('app://electron', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('allows file:// protocol', () => {
      const callback = jest.fn();
      corsOriginCallback('file:///index.html', callback);
      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });
});
