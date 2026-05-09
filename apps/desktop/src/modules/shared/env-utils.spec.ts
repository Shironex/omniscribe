import { buildSafeEnv, ENV_ALLOWLIST, ENV_BLOCKLIST_PATTERNS } from './env-utils';

describe('env-utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Start with a clean environment for each test
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ================================================================
  // ENV_ALLOWLIST
  // ================================================================
  describe('ENV_ALLOWLIST', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(ENV_ALLOWLIST)).toBe(true);
      expect(ENV_ALLOWLIST.length).toBeGreaterThan(0);
    });

    it('should include essential platform variables', () => {
      expect(ENV_ALLOWLIST).toContain('PATH');
      expect(ENV_ALLOWLIST).toContain('HOME');
      expect(ENV_ALLOWLIST).toContain('SHELL');
      expect(ENV_ALLOWLIST).toContain('LANG');
      expect(ENV_ALLOWLIST).toContain('TERM');
    });

    it('should include Windows platform variables', () => {
      expect(ENV_ALLOWLIST).toContain('COMSPEC');
      expect(ENV_ALLOWLIST).toContain('SYSTEMROOT');
      expect(ENV_ALLOWLIST).toContain('USERPROFILE');
      expect(ENV_ALLOWLIST).toContain('APPDATA');
    });

    it('should include development tool variables', () => {
      expect(ENV_ALLOWLIST).toContain('NVM_DIR');
      expect(ENV_ALLOWLIST).toContain('PNPM_HOME');
      expect(ENV_ALLOWLIST).toContain('GOPATH');
      expect(ENV_ALLOWLIST).toContain('CARGO_HOME');
    });
  });

  // ================================================================
  // ENV_BLOCKLIST_PATTERNS
  // ================================================================
  describe('ENV_BLOCKLIST_PATTERNS', () => {
    it('should be a non-empty array of RegExp', () => {
      expect(Array.isArray(ENV_BLOCKLIST_PATTERNS)).toBe(true);
      expect(ENV_BLOCKLIST_PATTERNS.length).toBeGreaterThan(0);
      for (const p of ENV_BLOCKLIST_PATTERNS) {
        expect(p).toBeInstanceOf(RegExp);
      }
    });

    it('should match Electron internals', () => {
      const matches = (name: string) => ENV_BLOCKLIST_PATTERNS.some(p => p.test(name));
      expect(matches('ELECTRON_RUN_AS_NODE')).toBe(true);
      expect(matches('ELECTRON_ENABLE_LOGGING')).toBe(true);
      expect(matches('electron_something')).toBe(true); // case insensitive
    });

    it('should match secret-related patterns', () => {
      const matches = (name: string) => ENV_BLOCKLIST_PATTERNS.some(p => p.test(name));
      expect(matches('MY_SECRET')).toBe(true);
      expect(matches('DB_PASSWORD')).toBe(true);
      expect(matches('AUTH_TOKEN')).toBe(true);
      expect(matches('AWS_CREDENTIAL')).toBe(true);
      expect(matches('STRIPE_API_KEY')).toBe(true);
      expect(matches('SSH_PRIVATE_KEY')).toBe(true);
    });

    it('should match dynamic linker injection vectors', () => {
      const matches = (name: string) => ENV_BLOCKLIST_PATTERNS.some(p => p.test(name));
      expect(matches('LD_PRELOAD')).toBe(true);
      expect(matches('LD_LIBRARY_PATH')).toBe(true);
      expect(matches('DYLD_INSERT_LIBRARIES')).toBe(true);
      expect(matches('DYLD_FRAMEWORK_PATH')).toBe(true);
    });

    it('should match shell startup injection vectors', () => {
      const matches = (name: string) => ENV_BLOCKLIST_PATTERNS.some(p => p.test(name));
      expect(matches('BASH_ENV')).toBe(true);
      expect(matches('ENV')).toBe(true);
      expect(matches('BASH_FUNC_x')).toBe(true);
      expect(matches('ZDOTDIR')).toBe(true);
      expect(matches('zdotdir')).toBe(true);
    });

    it('should match NODE_OPTIONS and NODE_EXTRA_CA_CERTS', () => {
      const matches = (name: string) => ENV_BLOCKLIST_PATTERNS.some(p => p.test(name));
      expect(matches('NODE_OPTIONS')).toBe(true);
      expect(matches('NODE_EXTRA_CA_CERTS')).toBe(true);
    });
  });

  // ================================================================
  // buildSafeEnv
  // ================================================================
  describe('buildSafeEnv', () => {
    it('should include allowlisted variables present in process.env', () => {
      process.env = { PATH: '/usr/bin', HOME: '/home/user' };

      const result = buildSafeEnv();

      expect(result.PATH).toBe('/usr/bin');
      expect(result.HOME).toBe('/home/user');
    });

    it('should exclude variables not in the allowlist', () => {
      process.env = {
        PATH: '/usr/bin',
        RANDOM_VAR: 'value',
        MY_CUSTOM_SETTING: 'test',
      };

      const result = buildSafeEnv();

      expect(result.PATH).toBe('/usr/bin');
      expect(result.RANDOM_VAR).toBeUndefined();
      expect(result.MY_CUSTOM_SETTING).toBeUndefined();
    });

    it('should not leak blocklisted vars even if set in process.env', () => {
      // NODE_OPTIONS and ELECTRON_RUN_AS_NODE are not in the allowlist,
      // but we verify they don't appear even when present in process.env
      process.env = { PATH: '/usr/bin', NODE_OPTIONS: '--inspect', ELECTRON_RUN_AS_NODE: '1' };
      const result = buildSafeEnv();
      expect(result.NODE_OPTIONS).toBeUndefined();
      expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(result.PATH).toBe('/usr/bin');
    });

    it('should skip allowlisted variables not present in process.env', () => {
      process.env = { PATH: '/usr/bin' };

      const result = buildSafeEnv();

      expect(result.PATH).toBe('/usr/bin');
      expect(result.HOME).toBeUndefined();
      expect(result.SHELL).toBeUndefined();
    });

    it('should handle empty process.env', () => {
      process.env = {};

      const result = buildSafeEnv();

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should include extra env vars that bypass the allowlist', () => {
      process.env = {};

      const result = buildSafeEnv({ MY_CUSTOM_VAR: 'hello' });

      expect(result.MY_CUSTOM_VAR).toBe('hello');
    });

    it('should filter extra env vars through the blocklist', () => {
      process.env = {};

      const result = buildSafeEnv({
        MY_SECRET: 'should-be-blocked',
        API_KEY_STRIPE: 'should-be-blocked',
        DB_PASSWORD: 'should-be-blocked',
        SAFE_VAR: 'allowed',
      });

      expect(result.MY_SECRET).toBeUndefined();
      expect(result.API_KEY_STRIPE).toBeUndefined();
      expect(result.DB_PASSWORD).toBeUndefined();
      expect(result.SAFE_VAR).toBe('allowed');
    });

    it('should block Electron internals from extra vars', () => {
      process.env = {};

      const result = buildSafeEnv({
        ELECTRON_RUN_AS_NODE: '1',
        ELECTRON_ENABLE_LOGGING: '1',
      });

      expect(result.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(result.ELECTRON_ENABLE_LOGGING).toBeUndefined();
    });

    it('should block dynamic linker injection from extra vars', () => {
      process.env = {};

      const result = buildSafeEnv({
        LD_PRELOAD: '/malicious/lib.so',
        LD_LIBRARY_PATH: '/malicious/libs',
        DYLD_INSERT_LIBRARIES: '/malicious/lib.dylib',
      });

      expect(result.LD_PRELOAD).toBeUndefined();
      expect(result.LD_LIBRARY_PATH).toBeUndefined();
      expect(result.DYLD_INSERT_LIBRARIES).toBeUndefined();
    });

    it('should block shell startup injection from extra vars', () => {
      process.env = {};

      const result = buildSafeEnv({
        BASH_ENV: '/malicious/script.sh',
        ENV: '/malicious/profile',
        BASH_FUNC_exploit: '() { malicious; }',
      });

      expect(result.BASH_ENV).toBeUndefined();
      expect(result.ENV).toBeUndefined();
      expect(result.BASH_FUNC_exploit).toBeUndefined();
    });

    it('should block NODE_OPTIONS from extra vars', () => {
      process.env = {};

      const result = buildSafeEnv({ NODE_OPTIONS: '--inspect-brk' });

      expect(result.NODE_OPTIONS).toBeUndefined();
    });

    it('should combine process.env allowlisted vars with extra vars', () => {
      process.env = { PATH: '/usr/bin', HOME: '/home/user' };

      const result = buildSafeEnv({ CUSTOM: 'value' });

      expect(result.PATH).toBe('/usr/bin');
      expect(result.HOME).toBe('/home/user');
      expect(result.CUSTOM).toBe('value');
    });

    it('should let extras override process.env values for non-blocklisted keys', () => {
      process.env = { LANG: 'en_US.UTF-8' };

      const result = buildSafeEnv({ LANG: 'C.UTF-8' });

      expect(result.LANG).toBe('C.UTF-8');
    });

    it('should refuse to let extras override PATH inherited from process.env', () => {
      process.env = { PATH: '/usr/bin' };

      const result = buildSafeEnv({ PATH: '/malicious/bin' });

      // PATH/HOME/SHELL are caller-blocked: callers cannot rewrite the
      // shell-resolution variables. The host's PATH still flows through.
      expect(result.PATH).toBe('/usr/bin');
    });

    it('blocks caller overrides of dev-tool path roots', () => {
      process.env = { NVM_DIR: '/home/me/.nvm', PNPM_HOME: '/home/me/.local/share/pnpm' };

      const result = buildSafeEnv({
        PATH: '/atk/bin',
        HOME: '/atk/home',
        SHELL: '/atk/bin/sh',
        NVM_DIR: '/atk/.nvm',
        PNPM_HOME: '/atk/pnpm',
        BUN_INSTALL: '/atk/bun',
        HOMEBREW_PREFIX: '/atk/brew',
        VOLTA_HOME: '/atk/.volta',
        FNM_DIR: '/atk/.fnm',
        FNM_MULTISHELL_PATH: '/atk/.fnm-shell',
        ASDF_DIR: '/atk/.asdf',
        ASDF_DATA_DIR: '/atk/.asdf-data',
        PYENV_ROOT: '/atk/.pyenv',
        RBENV_ROOT: '/atk/.rbenv',
      });

      // Inherited values stand; caller overrides are dropped.
      expect(result.NVM_DIR).toBe('/home/me/.nvm');
      expect(result.PNPM_HOME).toBe('/home/me/.local/share/pnpm');
      expect(result.PATH).toBeUndefined();
      expect(result.HOME).toBeUndefined();
      expect(result.SHELL).toBeUndefined();
      expect(result.BUN_INSTALL).toBeUndefined();
      expect(result.HOMEBREW_PREFIX).toBeUndefined();
      expect(result.VOLTA_HOME).toBeUndefined();
      expect(result.FNM_DIR).toBeUndefined();
      expect(result.FNM_MULTISHELL_PATH).toBeUndefined();
      expect(result.ASDF_DIR).toBeUndefined();
      expect(result.ASDF_DATA_DIR).toBeUndefined();
      expect(result.PYENV_ROOT).toBeUndefined();
      expect(result.RBENV_ROOT).toBeUndefined();
    });

    it('caller blocklist is case-insensitive', () => {
      process.env = {};
      const result = buildSafeEnv({ path: '/atk/bin', Home: '/atk' });
      expect(result.path).toBeUndefined();
      expect(result.Home).toBeUndefined();
    });

    it('drops non-string extras silently', () => {
      process.env = {};
      const result = buildSafeEnv({
        VALID: 'ok',
        NUMBER: 5 as unknown as string,
        OBJECT: {} as unknown as string,
      });
      expect(result.VALID).toBe('ok');
      expect(result.NUMBER).toBeUndefined();
      expect(result.OBJECT).toBeUndefined();
    });

    it('should handle empty extra object', () => {
      process.env = { PATH: '/usr/bin' };

      const result = buildSafeEnv({});

      expect(result.PATH).toBe('/usr/bin');
      expect(Object.keys(result)).toHaveLength(1);
    });

    it('should handle undefined extra parameter', () => {
      process.env = { PATH: '/usr/bin' };

      const result = buildSafeEnv(undefined);

      expect(result.PATH).toBe('/usr/bin');
    });

    it('should be case-insensitive for blocklist pattern matching', () => {
      process.env = {};

      const result = buildSafeEnv({
        my_secret: 'blocked',
        My_Password: 'blocked',
        AUTH_token: 'blocked',
      });

      expect(result.my_secret).toBeUndefined();
      expect(result.My_Password).toBeUndefined();
      expect(result.AUTH_token).toBeUndefined();
    });
  });
});
