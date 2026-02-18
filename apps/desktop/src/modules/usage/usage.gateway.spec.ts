import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Socket } from 'socket.io';

// Mock ../plugin barrel to avoid electron-store import in test environment
jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { UsageGateway } from './usage.gateway';
import { UsageService } from './usage.service';

// ---- Helpers ----

function createMockSocket(id = 'client-1'): Socket {
  return {
    id,
    join: jest.fn(),
    leave: jest.fn(),
    emit: jest.fn(),
    broadcast: { emit: jest.fn() },
  } as unknown as Socket;
}

// ---- Tests ----

const installedStatus = {
  installed: true,
  version: '1.0.27',
  path: '/usr/local/bin/claude',
  method: 'path' as const,
  platform: 'linux',
  arch: 'x64',
  auth: { authenticated: true },
};

const notInstalledStatus = {
  installed: false,
  platform: 'win32',
  arch: 'x64',
  auth: { authenticated: false },
};

describe('UsageGateway', () => {
  let gateway: UsageGateway;
  let usageService: jest.Mocked<UsageService>;
  let mockSocket: Socket;

  beforeEach(async () => {
    usageService = {
      fetchUsageForMode: jest.fn(),
      getStatusForMode: jest.fn(),
    } as unknown as jest.Mocked<UsageService>;

    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([])],
      providers: [UsageGateway, { provide: UsageService, useValue: usageService }],
    }).compile();

    gateway = module.get<UsageGateway>(UsageGateway);
    mockSocket = createMockSocket();
  });

  // ================================================================
  // handleFetch (uses fetchUsageForMode)
  // ================================================================
  describe('handleFetch', () => {
    const payload = { workingDir: '/my/project' };

    it('should return cli_not_found error when no usage provider available', async () => {
      usageService.fetchUsageForMode.mockResolvedValue(null);

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({
        error: 'cli_not_found',
        message: 'No usage provider available',
      });
      expect(usageService.fetchUsageForMode).toHaveBeenCalledWith('claude', '/my/project');
    });

    it('should return usage data on successful fetch (rawUsage for frontend compat)', async () => {
      const usageData = {
        sessionPercentage: 25,
        sessionResetTime: '2025-01-01T12:00:00.000Z',
        sessionResetText: 'Resets in 2h 15m',
        weeklyPercentage: 40,
        weeklyResetTime: '2025-01-06T12:59:00.000Z',
        weeklyResetText: 'Resets Dec 30 at 7:59pm',
        sonnetWeeklyPercentage: 10,
        sonnetResetText: 'Resets Dec 27 at 9:59am',
        lastUpdated: '2025-01-01T10:00:00.000Z',
        userTimezone: 'America/New_York',
      };

      usageService.fetchUsageForMode.mockResolvedValue({
        providerUsage: { percentageUsed: 25, periodStart: '', periodEnd: '', resetText: '' },
        rawUsage: usageData,
      });

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({ usage: usageData });
      expect(usageService.fetchUsageForMode).toHaveBeenCalledWith('claude', '/my/project');
    });

    it('should return error when fetchUsageForMode returns an error', async () => {
      usageService.fetchUsageForMode.mockResolvedValue({
        error: 'auth_required',
        message: 'Authentication required',
      });

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({
        error: 'auth_required',
        message: 'Authentication required',
      });
      expect(result.usage).toBeUndefined();
    });

    it('should return timeout error from fetchUsageForMode', async () => {
      usageService.fetchUsageForMode.mockResolvedValue({
        error: 'timeout',
        message: 'The Claude CLI took too long to respond.',
      });

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({
        error: 'timeout',
        message: 'The Claude CLI took too long to respond.',
      });
    });

    it('should return trust_prompt error from fetchUsageForMode', async () => {
      usageService.fetchUsageForMode.mockResolvedValue({
        error: 'trust_prompt',
        message: 'TRUST_PROMPT_PENDING: Please approve folder access.',
      });

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({
        error: 'trust_prompt',
        message: 'TRUST_PROMPT_PENDING: Please approve folder access.',
      });
    });

    it('should return unknown error from fetchUsageForMode', async () => {
      usageService.fetchUsageForMode.mockResolvedValue({
        error: 'unknown',
        message: 'Something went wrong',
      });

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({
        error: 'unknown',
        message: 'Something went wrong',
      });
    });

    it('should pass the correct workingDir to fetchUsageForMode', async () => {
      usageService.fetchUsageForMode.mockResolvedValue({
        providerUsage: { percentageUsed: 0, periodStart: '', periodEnd: '', resetText: '' },
        rawUsage: {
          sessionPercentage: 0,
          sessionResetTime: '',
          sessionResetText: '',
          weeklyPercentage: 0,
          weeklyResetTime: '',
          weeklyResetText: '',
          sonnetWeeklyPercentage: 0,
          sonnetResetText: '',
          lastUpdated: '',
          userTimezone: '',
        },
      });

      await gateway.handleFetch(mockSocket, { workingDir: '/different/path' });

      expect(usageService.fetchUsageForMode).toHaveBeenCalledWith('claude', '/different/path');
    });

    it('should return parse_error when rawUsage is not available', async () => {
      usageService.fetchUsageForMode.mockResolvedValue({
        providerUsage: { percentageUsed: 25, periodStart: '', periodEnd: '', resetText: '' },
        // No rawUsage
      });

      const result = await gateway.handleFetch(mockSocket, payload);

      expect(result).toEqual({
        error: 'parse_error',
        message: 'Usage data format mismatch',
      });
    });
  });

  // ================================================================
  // handleStatus (uses getStatusForMode)
  // ================================================================
  describe('handleStatus', () => {
    it('should return CLI status on success', async () => {
      usageService.getStatusForMode.mockResolvedValue(installedStatus);

      const result = await gateway.handleStatus(mockSocket, undefined);

      expect(result).toEqual({ status: installedStatus });
      expect(result.error).toBeUndefined();
      expect(usageService.getStatusForMode).toHaveBeenCalledWith('claude', undefined);
    });

    it('should return not-installed status', async () => {
      usageService.getStatusForMode.mockResolvedValue(notInstalledStatus);

      const result = await gateway.handleStatus(mockSocket, undefined);

      expect(result.status).toEqual(notInstalledStatus);
      expect(result.status.installed).toBe(false);
    });

    it('should pass refresh flag to service when true', async () => {
      usageService.getStatusForMode.mockResolvedValue(installedStatus);

      await gateway.handleStatus(mockSocket, { refresh: true });

      expect(usageService.getStatusForMode).toHaveBeenCalledWith('claude', true);
    });

    it('should pass refresh flag to service when false', async () => {
      usageService.getStatusForMode.mockResolvedValue(installedStatus);

      await gateway.handleStatus(mockSocket, { refresh: false });

      expect(usageService.getStatusForMode).toHaveBeenCalledWith('claude', false);
    });

    it('should handle undefined payload', async () => {
      usageService.getStatusForMode.mockResolvedValue(installedStatus);

      await gateway.handleStatus(mockSocket, undefined);

      expect(usageService.getStatusForMode).toHaveBeenCalledWith('claude', undefined);
    });

    it('should handle null payload', async () => {
      usageService.getStatusForMode.mockResolvedValue(installedStatus);

      await gateway.handleStatus(mockSocket, null as any);

      // payload?.refresh will be undefined for null
      expect(usageService.getStatusForMode).toHaveBeenCalledWith('claude', undefined);
    });

    it('should handle payload without refresh field', async () => {
      usageService.getStatusForMode.mockResolvedValue(installedStatus);

      await gateway.handleStatus(mockSocket, {} as any);

      expect(usageService.getStatusForMode).toHaveBeenCalledWith('claude', undefined);
    });

    it('should return fallback status with platform/arch on Error', async () => {
      usageService.getStatusForMode.mockRejectedValue(new Error('Service crashed'));

      const result = await gateway.handleStatus(mockSocket, undefined);

      expect(result.status).toEqual({
        installed: false,
        platform: process.platform,
        arch: process.arch,
        auth: { authenticated: false },
      });
      expect(result.error).toBe('Service crashed');
    });

    it('should return fallback status on non-Error thrown value', async () => {
      usageService.getStatusForMode.mockRejectedValue('string error');

      const result = await gateway.handleStatus(mockSocket, undefined);

      expect(result.status).toEqual({
        installed: false,
        platform: process.platform,
        arch: process.arch,
        auth: { authenticated: false },
      });
      expect(result.error).toBe('string error');
    });

    it('should return fallback status on numeric thrown value', async () => {
      usageService.getStatusForMode.mockRejectedValue(42);

      const result = await gateway.handleStatus(mockSocket, undefined);

      expect(result.status.installed).toBe(false);
      expect(result.status.platform).toBe(process.platform);
      expect(result.status.arch).toBe(process.arch);
      expect(result.error).toBe('42');
    });

    it('should include platform and arch from process in fallback', async () => {
      usageService.getStatusForMode.mockRejectedValue(new Error('fail'));

      const result = await gateway.handleStatus(mockSocket, undefined);

      // Verify that the fallback uses actual process values
      expect(typeof result.status.platform).toBe('string');
      expect(typeof result.status.arch).toBe('string');
      expect(result.status.platform.length).toBeGreaterThan(0);
      expect(result.status.arch.length).toBeGreaterThan(0);
    });

    it('should set authenticated to false in fallback status', async () => {
      usageService.getStatusForMode.mockRejectedValue(new Error('fail'));

      const result = await gateway.handleStatus(mockSocket, undefined);

      expect(result.status.auth.authenticated).toBe(false);
    });
  });
});
