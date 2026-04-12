// Mock electron before importing the service (service uses require('electron') lazily)
jest.mock(
  'electron',
  () => ({
    app: { isPackaged: false },
  }),
  { virtual: true }
);

import { CdpInfoService } from './cdp-info.service';

const electronMock = require('electron') as { app: { isPackaged: boolean } };

describe('CdpInfoService', () => {
  const originalEnv = { ...process.env };
  let service: CdpInfoService;

  beforeEach(() => {
    service = new CdpInfoService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    electronMock.app.isPackaged = false;
  });

  describe('getPort', () => {
    it('returns the CDP port', () => {
      expect(service.getPort()).toBe(9222);
    });
  });

  describe('getEndpoint', () => {
    it('returns the loopback CDP endpoint', () => {
      expect(service.getEndpoint()).toBe('http://127.0.0.1:9222');
    });
  });

  describe('isEnabled', () => {
    it('true when unpackaged + NODE_ENV=development', () => {
      electronMock.app.isPackaged = false;
      process.env.NODE_ENV = 'development';
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      expect(service.isEnabled()).toBe(true);
    });

    it('false when packaged without env override', () => {
      electronMock.app.isPackaged = true;
      process.env.NODE_ENV = 'development';
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      expect(service.isEnabled()).toBe(false);
    });

    it('true when packaged with OMNISCRIBE_ENABLE_CDP=1', () => {
      electronMock.app.isPackaged = true;
      process.env.NODE_ENV = 'production';
      process.env.OMNISCRIBE_ENABLE_CDP = '1';
      expect(service.isEnabled()).toBe(true);
    });

    it('false when unpackaged + NODE_ENV=production without env override', () => {
      electronMock.app.isPackaged = false;
      process.env.NODE_ENV = 'production';
      delete process.env.OMNISCRIBE_ENABLE_CDP;
      expect(service.isEnabled()).toBe(false);
    });
  });
});
