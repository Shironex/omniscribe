// ---- Mocks ----

const mockIsWindows = jest.fn(() => false);
jest.mock('./path', () => ({
  isWindows: () => mockIsWindows(),
}));

// ---- Tests ----

describe('version-check', () => {
  let fetchLatestVersion: typeof import('./version-check').fetchLatestVersion;
  let fetchAvailableVersions: typeof import('./version-check').fetchAvailableVersions;
  let cleanVersionString: typeof import('./version-check').cleanVersionString;
  let checkClaudeVersion: typeof import('./version-check').checkClaudeVersion;
  let getInstallCommand: typeof import('./version-check').getInstallCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWindows.mockReturnValue(false);
  });

  // ================================================================
  // cleanVersionString (pure function, no cache concerns)
  // ================================================================
  describe('cleanVersionString', () => {
    beforeEach(() => {
      // Safe to import once since cleanVersionString is stateless
      const mod = require('./version-check');
      cleanVersionString = mod.cleanVersionString;
    });

    it('should extract version from "2.1.31 (Claude Code)"', () => {
      expect(cleanVersionString('2.1.31 (Claude Code)')).toBe('2.1.31');
    });

    it('should return clean semver for simple version string', () => {
      expect(cleanVersionString('1.0.0')).toBe('1.0.0');
    });

    it('should handle version with prefix text', () => {
      expect(cleanVersionString('v3.2.1')).toBe('3.2.1');
    });

    it('should return null for invalid version string', () => {
      expect(cleanVersionString('not-a-version')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(cleanVersionString('')).toBeNull();
    });

    it('should extract version from string with multiple numbers', () => {
      const result = cleanVersionString('claude 2.1.31 build 42');
      expect(result).toBe('2.1.31');
    });
  });

  // ================================================================
  // getInstallCommand (pure function, no cache concerns)
  // ================================================================
  describe('getInstallCommand', () => {
    beforeEach(() => {
      const mod = require('./version-check');
      getInstallCommand = mod.getInstallCommand;
    });

    it('should return Unix fresh install command', () => {
      mockIsWindows.mockReturnValue(false);

      const result = getInstallCommand({ isUpdate: false });

      expect(result.command).toContain('curl');
      expect(result.command).toContain('install.sh');
      expect(result.description).toContain('Install');
    });

    it('should return Windows fresh install command', () => {
      mockIsWindows.mockReturnValue(true);

      const result = getInstallCommand({ isUpdate: false });

      expect(result.command).toContain('irm');
      expect(result.command).toContain('install.ps1');
      expect(result.description).toContain('Install');
    });

    it('should return Unix update command for latest', () => {
      mockIsWindows.mockReturnValue(false);

      const result = getInstallCommand({ isUpdate: true });

      expect(result.command).toContain('pkill');
      expect(result.command).toContain('claude install --force latest');
      expect(result.description).toContain('Update');
      expect(result.description).toContain('latest');
    });

    it('should return Windows update command for latest', () => {
      mockIsWindows.mockReturnValue(true);

      const result = getInstallCommand({ isUpdate: true });

      expect(result.command).toContain('taskkill');
      expect(result.command).toContain('claude install --force latest');
      expect(result.description).toContain('Update');
    });

    it('should include specific version in update command', () => {
      mockIsWindows.mockReturnValue(false);

      const result = getInstallCommand({ isUpdate: true, version: '2.0.0' });

      expect(result.command).toContain('claude install --force 2.0.0');
      expect(result.description).toContain('2.0.0');
    });

    it('should include specific version in Windows update command', () => {
      mockIsWindows.mockReturnValue(true);

      const result = getInstallCommand({ isUpdate: true, version: '2.0.0' });

      expect(result.command).toContain('claude install --force 2.0.0');
      expect(result.description).toContain('2.0.0');
    });
  });

  // ================================================================
  // fetchLatestVersion (uses module-level cache)
  // ================================================================
  describe('fetchLatestVersion', () => {
    it('should return version on success', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchLatestVersion = mod.fetchLatestVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      const result = await fetchLatestVersion();

      expect(result).toBe('2.1.31');
    });

    it('should return null on HTTP error without cache', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchLatestVersion = mod.fetchLatestVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchLatestVersion();

      expect(result).toBeNull();
    });

    it('should return null on network error without cache', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchLatestVersion = mod.fetchLatestVersion;
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await fetchLatestVersion();

      expect(result).toBeNull();
    });

    it('should return null when response has no version field', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchLatestVersion = mod.fetchLatestVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await fetchLatestVersion();

      expect(result).toBeNull();
    });

    it('should return cached version on second call within TTL', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchLatestVersion = mod.fetchLatestVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      await fetchLatestVersion();
      (global.fetch as jest.Mock).mockClear();

      const result = await fetchLatestVersion();

      expect(result).toBe('2.1.31');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return expired cached version on fetch failure', async () => {
      let isolated: { fetchLatestVersion: typeof fetchLatestVersion };
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        isolated = require('./version-check');
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.0.0' }),
      });

      // First call populates cache
      await isolated!.fetchLatestVersion();

      // Force cache expiry by manipulating Date.now
      const originalDateNow = Date.now;
      Date.now = () => originalDateNow() + 25 * 60 * 60 * 1000; // 25 hours later

      // Second call fails but should return cached value
      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

      const result = await isolated!.fetchLatestVersion();

      expect(result).toBe('2.0.0');

      Date.now = originalDateNow;
    });
  });

  // ================================================================
  // fetchAvailableVersions (uses module-level cache)
  // ================================================================
  describe('fetchAvailableVersions', () => {
    it('should return sorted versions filtered by limit', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchAvailableVersions = mod.fetchAvailableVersions;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: {
              '1.0.0': {},
              '2.0.0': {},
              '1.5.0': {},
              '3.0.0': {},
            },
          }),
      });

      const result = await fetchAvailableVersions(2);

      expect(result).toHaveLength(2);
      // Should be sorted newest first
      expect(result[0]).toBe('3.0.0');
      expect(result[1]).toBe('2.0.0');
    });

    it('should filter out pre-release versions', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchAvailableVersions = mod.fetchAvailableVersions;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: {
              '1.0.0': {},
              '2.0.0-beta.1': {},
              '2.0.0-rc.1': {},
              '1.5.0': {},
            },
          }),
      });

      const result = await fetchAvailableVersions(20);

      expect(result).toEqual(['1.5.0', '1.0.0']);
      expect(result).not.toContain('2.0.0-beta.1');
      expect(result).not.toContain('2.0.0-rc.1');
    });

    it('should return empty array on failure without cache', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchAvailableVersions = mod.fetchAvailableVersions;
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

      const result = await fetchAvailableVersions();

      expect(result).toEqual([]);
    });

    it('should use default limit of 20', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchAvailableVersions = mod.fetchAvailableVersions;
      });

      const versions: Record<string, unknown> = {};
      for (let i = 1; i <= 30; i++) {
        versions[`1.0.${i}`] = {};
      }

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions }),
      });

      const result = await fetchAvailableVersions();

      expect(result).toHaveLength(20);
    });

    it('should return cached versions on second call within TTL', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchAvailableVersions = mod.fetchAvailableVersions;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            versions: { '1.0.0': {}, '2.0.0': {} },
          }),
      });

      await fetchAvailableVersions();
      (global.fetch as jest.Mock).mockClear();

      const result = await fetchAvailableVersions();

      expect(result).toEqual(['2.0.0', '1.0.0']);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle empty versions object', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        fetchAvailableVersions = mod.fetchAvailableVersions;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ versions: {} }),
      });

      const result = await fetchAvailableVersions();

      expect(result).toEqual([]);
    });
  });

  // ================================================================
  // checkClaudeVersion
  // ================================================================
  describe('checkClaudeVersion', () => {
    it('should return outdated result when installed version is older', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        checkClaudeVersion = mod.checkClaudeVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      const result = await checkClaudeVersion('1.0.0');

      expect(result).not.toBeNull();
      expect(result!.isOutdated).toBe(true);
      expect(result!.latestVersion).toBe('2.1.31');
      expect(result!.installedVersion).toBe('1.0.0');
      expect(result!.lastChecked).toBeDefined();
    });

    it('should return not outdated when installed version matches latest', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        checkClaudeVersion = mod.checkClaudeVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      const result = await checkClaudeVersion('2.1.31');

      expect(result).not.toBeNull();
      expect(result!.isOutdated).toBe(false);
    });

    it('should clean installed version string before comparison', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        checkClaudeVersion = mod.checkClaudeVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      const result = await checkClaudeVersion('2.1.31 (Claude Code)');

      expect(result).not.toBeNull();
      expect(result!.isOutdated).toBe(false);
      expect(result!.installedVersion).toBe('2.1.31');
    });

    it('should return null when latest version cannot be fetched', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        checkClaudeVersion = mod.checkClaudeVersion;
      });

      global.fetch = jest.fn().mockRejectedValue(new Error('offline'));

      const result = await checkClaudeVersion('1.0.0');

      expect(result).toBeNull();
    });

    it('should treat missing installed version as outdated', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        checkClaudeVersion = mod.checkClaudeVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      const result = await checkClaudeVersion(undefined);

      expect(result).not.toBeNull();
      expect(result!.isOutdated).toBe(true);
    });

    it('should include lastChecked as ISO string', async () => {
      jest.isolateModules(() => {
        jest.mock('./path', () => ({ isWindows: () => false }));
        const mod = require('./version-check');
        checkClaudeVersion = mod.checkClaudeVersion;
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '2.1.31' }),
      });

      const result = await checkClaudeVersion('1.0.0');

      expect(result!.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
});
