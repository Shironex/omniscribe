import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSocket, mockSocketModule } from '../../test/mocks/socket';

// vi.hoisted ensures these are available when the hoisted vi.mock factories run
const { mockRawEmitAsync, mockRawEmitWithErrorHandling, mockRawEmitWithSuccessHandling } =
  vi.hoisted(() => ({
    mockRawEmitAsync: vi.fn(),
    mockRawEmitWithErrorHandling: vi.fn(),
    mockRawEmitWithSuccessHandling: vi.fn(),
  }));

vi.mock('@/lib/socket', () => mockSocketModule);

vi.mock('@/lib/socketHelpers', () => ({
  emitAsync: mockRawEmitAsync,
  emitWithErrorHandling: mockRawEmitWithErrorHandling,
  emitWithSuccessHandling: mockRawEmitWithSuccessHandling,
}));

import {
  isSocketConnected,
  emitAsync,
  emitWithErrorHandling,
  emitWithSuccessHandling,
} from '../plugin-sdk';

describe('isSocketConnected', () => {
  beforeEach(() => {
    mockSocket.__reset();
  });

  it('returns true when socket is connected', () => {
    mockSocket.connected = true;
    expect(isSocketConnected()).toBe(true);
  });

  it('returns false when socket is disconnected', () => {
    mockSocket.connected = false;
    expect(isSocketConnected()).toBe(false);
  });

  it('returns false when socket is not initialized (throws)', () => {
    mockSocketModule.getSocket.mockImplementationOnce(() => {
      throw new Error('Socket not initialized');
    });
    expect(isSocketConnected()).toBe(false);
  });
});

describe('scoped emitAsync', () => {
  beforeEach(() => {
    mockRawEmitAsync.mockReset();
    mockRawEmitAsync.mockResolvedValue({ ok: true });
  });

  it('allows plugin:* events', async () => {
    await emitAsync('plugin:list-providers', {});
    expect(mockRawEmitAsync).toHaveBeenCalledWith('plugin:list-providers', {}, {});
  });

  it('allows usage:* events', async () => {
    await emitAsync('usage:fetch', { workingDir: '/test' }, { timeout: 60000 });
    expect(mockRawEmitAsync).toHaveBeenCalledWith(
      'usage:fetch',
      { workingDir: '/test' },
      { timeout: 60000 }
    );
  });

  it('blocks session:* events', async () => {
    await expect(emitAsync('session:create', {})).rejects.toThrow(
      'Plugin SDK: event "session:create" is not allowed'
    );
    expect(mockRawEmitAsync).not.toHaveBeenCalled();
  });

  it('blocks terminal:* events', async () => {
    await expect(emitAsync('terminal:input', { data: 'rm -rf /' })).rejects.toThrow(
      'Plugin SDK: event "terminal:input" is not allowed'
    );
    expect(mockRawEmitAsync).not.toHaveBeenCalled();
  });

  it('blocks git:* events', async () => {
    await expect(emitAsync('git:checkout', {})).rejects.toThrow(
      'Plugin SDK: event "git:checkout" is not allowed'
    );
  });

  it('blocks workspace:* events', async () => {
    await expect(emitAsync('workspace:save-state', {})).rejects.toThrow(
      'Plugin SDK: event "workspace:save-state" is not allowed'
    );
  });

  it('blocks github:* events', async () => {
    await expect(emitAsync('github:list-prs', {})).rejects.toThrow(
      'Plugin SDK: event "github:list-prs" is not allowed'
    );
  });

  it('blocks arbitrary event names', async () => {
    await expect(emitAsync('some:random:event', {})).rejects.toThrow(
      'Plugin SDK: event "some:random:event" is not allowed'
    );
  });
});

describe('scoped emitWithErrorHandling', () => {
  beforeEach(() => {
    mockRawEmitWithErrorHandling.mockReset();
    mockRawEmitWithErrorHandling.mockResolvedValue({ data: 'ok' });
  });

  it('allows plugin:* events', async () => {
    await emitWithErrorHandling('plugin:set-enabled', { id: 'test', enabled: true });
    expect(mockRawEmitWithErrorHandling).toHaveBeenCalledWith(
      'plugin:set-enabled',
      { id: 'test', enabled: true },
      {}
    );
  });

  it('blocks disallowed events', async () => {
    await expect(emitWithErrorHandling('session:remove', { id: '1' })).rejects.toThrow(
      'Plugin SDK: event "session:remove" is not allowed'
    );
    expect(mockRawEmitWithErrorHandling).not.toHaveBeenCalled();
  });
});

describe('scoped emitWithSuccessHandling', () => {
  beforeEach(() => {
    mockRawEmitWithSuccessHandling.mockReset();
    mockRawEmitWithSuccessHandling.mockResolvedValue(undefined);
  });

  it('allows usage:* events', async () => {
    await emitWithSuccessHandling('usage:fetch', {});
    expect(mockRawEmitWithSuccessHandling).toHaveBeenCalledWith('usage:fetch', {}, {}, undefined);
  });

  it('blocks disallowed events', async () => {
    await expect(emitWithSuccessHandling('zombie:cleanup', {})).rejects.toThrow(
      'Plugin SDK: event "zombie:cleanup" is not allowed'
    );
    expect(mockRawEmitWithSuccessHandling).not.toHaveBeenCalled();
  });
});
