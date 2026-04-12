import { EventEmitter } from 'events';

// Mock `net.createConnection` so we can simulate success/refused. Created
// as a jest.fn at module scope so each test can control its behavior.
const createConnectionMock = jest.fn();
jest.mock('net', () => ({
  createConnection: (...args: unknown[]) => createConnectionMock(...args),
}));

import { playwrightElectronCapability } from './playwright-electron.capability';

type FakeSocket = EventEmitter & {
  setTimeout: jest.Mock;
  destroy: jest.Mock;
};

function makeSocket(): FakeSocket {
  const s = new EventEmitter() as FakeSocket;
  s.setTimeout = jest.fn();
  s.destroy = jest.fn();
  return s;
}

const baseCtx = {
  sessionId: '',
  workingDir: '/tmp',
  projectPath: '/tmp',
  projectHash: '',
  statusUrl: null,
  instanceId: null,
};

describe('playwrightElectronCapability', () => {
  beforeEach(() => {
    createConnectionMock.mockReset();
  });

  describe('buildConfig', () => {
    it('uses ctx.electronCdpPort when provided', async () => {
      const cfg = await playwrightElectronCapability.buildConfig({
        ...baseCtx,
        electronCdpPort: 9333,
      });
      expect(cfg).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--cdp-endpoint', 'http://127.0.0.1:9333'],
      });
    });

    it('falls back to 9222 when electronCdpPort is unset', async () => {
      const cfg = await playwrightElectronCapability.buildConfig(baseCtx);
      expect(cfg).toEqual({
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest', '--cdp-endpoint', 'http://127.0.0.1:9222'],
      });
    });
  });

  describe('preflight', () => {
    it('returns ok when the TCP probe connects', async () => {
      const socket = makeSocket();
      createConnectionMock.mockReturnValue(socket);

      const resultPromise = playwrightElectronCapability.preflight!({
        ...baseCtx,
        electronCdpPort: 9222,
      });

      // Simulate successful connection on next tick
      setImmediate(() => socket.emit('connect'));

      const result = await resultPromise;
      expect(result).toEqual({ ok: true });
      expect(createConnectionMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 9222 });
      expect(socket.destroy).toHaveBeenCalled();
    });

    it('returns ok:false with a helpful reason when ECONNREFUSED', async () => {
      const socket = makeSocket();
      createConnectionMock.mockReturnValue(socket);

      const resultPromise = playwrightElectronCapability.preflight!({
        ...baseCtx,
        electronCdpPort: 9555,
      });

      setImmediate(() =>
        socket.emit('error', Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))
      );

      const result = await resultPromise;
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/No Electron app listening on port 9555/);
      expect(result.reason).toMatch(/--remote-debugging-port=9555/);
    });

    it('falls back to 9222 when electronCdpPort is unset', async () => {
      const socket = makeSocket();
      createConnectionMock.mockReturnValue(socket);

      const resultPromise = playwrightElectronCapability.preflight!(baseCtx);
      setImmediate(() => socket.emit('error', new Error('refused')));

      const result = await resultPromise;
      expect(createConnectionMock).toHaveBeenCalledWith({ host: '127.0.0.1', port: 9222 });
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/port 9222/);
    });
  });
});
