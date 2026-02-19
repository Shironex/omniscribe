import { Test, TestingModule } from '@nestjs/testing';

// Mock ../plugin barrel to avoid electron-store import in test environment
jest.mock('../plugin', () => ({
  PluginRegistryService: jest.fn(),
}));

import { UsageService } from './usage.service';
import { PluginRegistryService } from '../plugin';

// ---- Mocks ----

const mockPluginRegistry = {
  isPluginMode: jest.fn().mockReturnValue(false),
  isValidMode: jest
    .fn()
    .mockImplementation((mode: string) => mode === 'claude' || mode === 'plain'),
  getProvider: jest.fn().mockImplementation(() => {
    throw new Error('No provider registered');
  }),
  getProviderEntry: jest.fn().mockReturnValue(undefined),
  listProviders: jest.fn().mockReturnValue([]),
};

// Mock Claude usage data shape for backward compat testing
const mockClaudeUsage = {
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

// Mock provider usage data
const mockProviderUsage = {
  percentageUsed: 25,
  periodStart: '2025-01-01T00:00:00Z',
  periodEnd: '2025-01-01T12:00:00Z',
  resetText: 'Resets in 2h 15m',
};

function createMockProvider(overrides?: Record<string, unknown>) {
  return {
    capabilities: {
      supportsUsage: true,
      supportsSessionHistory: false,
      supportsMcp: false,
      supportedOperations: new Set(),
    },
    parseUsage: jest.fn().mockResolvedValue(mockProviderUsage),
    getUsageFetcher: jest.fn().mockReturnValue({
      lastFetchedUsage: mockClaudeUsage,
    }),
    getCliDetectionService: jest.fn().mockReturnValue({
      getFullStatus: jest.fn().mockResolvedValue({
        installed: true,
        version: '1.0.27',
        path: '/usr/local/bin/claude',
        method: 'path',
        platform: 'linux',
        arch: 'x64',
        auth: { authenticated: true },
      }),
    }),
    detectCli: jest.fn().mockResolvedValue({ installed: true }),
    ...overrides,
  };
}

// ---- Tests ----

describe('UsageService', () => {
  let service: UsageService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Restore mock defaults after clearAllMocks
    mockPluginRegistry.isPluginMode.mockReturnValue(false);
    mockPluginRegistry.getProvider.mockImplementation(() => {
      throw new Error('No provider registered');
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsageService, { provide: PluginRegistryService, useValue: mockPluginRegistry }],
    }).compile();

    service = module.get<UsageService>(UsageService);
  });

  // ================================================================
  // fetchUsageForMode()
  // ================================================================
  describe('fetchUsageForMode', () => {
    it('should return null for plain mode', async () => {
      const result = await service.fetchUsageForMode('plain', '/project');

      expect(result).toBeNull();
    });

    it('should return null for unknown non-plugin mode', async () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(false);

      const result = await service.fetchUsageForMode('unknown' as any, '/project');

      expect(result).toBeNull();
    });

    it('should delegate to plugin provider for claude mode', async () => {
      const provider = createMockProvider();
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).toBeDefined();
      expect(result!.providerUsage).toEqual(mockProviderUsage);
      expect(result!.rawUsage).toEqual(mockClaudeUsage);
      expect(provider.parseUsage).toHaveBeenCalledWith('/project');
    });

    it('should return providerUsage and rawUsage for backward compat', async () => {
      const provider = createMockProvider();
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.providerUsage).toBeDefined();
      expect(result!.rawUsage).toBeDefined();
      expect(result!.rawUsage!.sessionPercentage).toBe(25);
      expect(result!.rawUsage!.weeklyPercentage).toBe(40);
    });

    it('should return null when provider does not support usage', async () => {
      const provider = createMockProvider({
        capabilities: {
          supportsUsage: false,
          supportsSessionHistory: false,
          supportsMcp: false,
          supportedOperations: new Set(),
        },
      });
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).toBeNull();
    });

    it('should return null when parseUsage returns null', async () => {
      const provider = createMockProvider();
      (provider.parseUsage as jest.Mock).mockResolvedValue(null);
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).toBeNull();
    });

    it('should return providerUsage without rawUsage when fetcher has no data', async () => {
      const provider = createMockProvider({
        getUsageFetcher: jest.fn().mockReturnValue({ lastFetchedUsage: null }),
      });
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.providerUsage).toEqual(mockProviderUsage);
      expect(result!.rawUsage).toBeUndefined();
    });

    it('should return auth_required error on authentication failure', async () => {
      const provider = createMockProvider();
      (provider.parseUsage as jest.Mock).mockRejectedValue(
        new Error('OAuth token does not meet scope requirement - login authentication required')
      );
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.error).toBe('auth_required');
    });

    it('should return trust_prompt error on trust prompt failure', async () => {
      const provider = createMockProvider();
      (provider.parseUsage as jest.Mock).mockRejectedValue(new Error('TRUST_PROMPT pending'));
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.error).toBe('trust_prompt');
    });

    it('should return timeout error on timeout failure', async () => {
      const provider = createMockProvider();
      (provider.parseUsage as jest.Mock).mockRejectedValue(
        new Error('Operation timed out - took too long')
      );
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.error).toBe('timeout');
    });

    it('should return cli_not_found error when CLI not available', async () => {
      const provider = createMockProvider();
      (provider.parseUsage as jest.Mock).mockRejectedValue(new Error('CLI not found'));
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.error).toBe('cli_not_found');
    });

    it('should return unknown error for unrecognized failures', async () => {
      const provider = createMockProvider();
      (provider.parseUsage as jest.Mock).mockRejectedValue(new Error('Something unexpected'));
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const result = await service.fetchUsageForMode('claude', '/project');

      expect(result).not.toBeNull();
      expect(result!.error).toBe('unknown');
    });
  });

  // ================================================================
  // getStatusForMode()
  // ================================================================
  describe('getStatusForMode', () => {
    it('should return installed=true for plain mode', async () => {
      const status = await service.getStatusForMode('plain');

      expect(status).toEqual({ installed: true });
    });

    it('should return installed=false for unknown non-plugin mode', async () => {
      mockPluginRegistry.isPluginMode.mockReturnValue(false);

      const status = await service.getStatusForMode('unknown' as any);

      expect(status).toEqual({ installed: false, error: 'No provider for mode: unknown' });
    });

    it('should delegate to provider getCliDetectionService for Claude mode', async () => {
      const mockFullStatus = {
        installed: true,
        version: '1.0.27',
        path: '/usr/local/bin/claude',
        method: 'path',
        platform: 'linux',
        arch: 'x64',
        auth: { authenticated: true },
      };
      const provider = createMockProvider({
        getCliDetectionService: jest.fn().mockReturnValue({
          getFullStatus: jest.fn().mockResolvedValue(mockFullStatus),
        }),
      });
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const status = await service.getStatusForMode('claude');

      expect(status).toEqual(mockFullStatus);
    });

    it('should fall back to detectCli when getCliDetectionService is not available', async () => {
      const provider = createMockProvider();
      // Remove getCliDetectionService to test fallback
      delete (provider as any).getCliDetectionService;
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const status = await service.getStatusForMode('claude');

      expect(status).toEqual({ installed: true });
      expect(provider.detectCli).toHaveBeenCalled();
    });

    it('should return installed=false on detection error', async () => {
      const provider = createMockProvider();
      (provider.detectCli as jest.Mock).mockRejectedValue(new Error('Detection failed'));
      delete (provider as any).getCliDetectionService;
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const status = await service.getStatusForMode('claude');

      expect(status).toEqual({ installed: false, error: 'Detection failed' });
    });

    it('should pass forceRefresh parameter', async () => {
      const mockFullStatus = {
        installed: true,
        version: '2.0.0',
        auth: { authenticated: true },
      };
      const getFullStatus = jest.fn().mockResolvedValue(mockFullStatus);
      const provider = createMockProvider({
        getCliDetectionService: jest.fn().mockReturnValue({ getFullStatus }),
      });
      mockPluginRegistry.isPluginMode.mockReturnValue(true);
      mockPluginRegistry.getProvider.mockReturnValue(provider);

      const status = await service.getStatusForMode('claude', true);

      expect(status).toEqual(mockFullStatus);
    });
  });
});
