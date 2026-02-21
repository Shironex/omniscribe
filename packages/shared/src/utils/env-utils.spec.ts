import { ENV_ALLOWLIST, ENV_BLOCKLIST_PATTERNS, buildSafeEnv } from './env-utils';

describe('ENV_ALLOWLIST', () => {
  it('includes standard shell variables', () => {
    expect(ENV_ALLOWLIST).toContain('HOME');
    expect(ENV_ALLOWLIST).toContain('PATH');
    expect(ENV_ALLOWLIST).toContain('SHELL');
  });

  it('includes Windows platform variables', () => {
    expect(ENV_ALLOWLIST).toContain('COMSPEC');
    expect(ENV_ALLOWLIST).toContain('APPDATA');
    expect(ENV_ALLOWLIST).toContain('LOCALAPPDATA');
  });

  it('includes dev tool variables', () => {
    expect(ENV_ALLOWLIST).toContain('NVM_DIR');
    expect(ENV_ALLOWLIST).toContain('PNPM_HOME');
  });
});

describe('ENV_BLOCKLIST_PATTERNS', () => {
  it('blocks Electron internals', () => {
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('ELECTRON_RUN_AS_NODE'))).toBe(true);
  });

  it('blocks secrets', () => {
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('SECRET_KEY'))).toBe(true);
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('MY_PASSWORD'))).toBe(true);
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('API_KEY'))).toBe(true);
  });

  it('blocks injection vectors', () => {
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('LD_PRELOAD'))).toBe(true);
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('DYLD_INSERT_LIBRARIES'))).toBe(true);
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('BASH_ENV'))).toBe(true);
  });

  it('does not block safe variables', () => {
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('HOME'))).toBe(false);
    expect(ENV_BLOCKLIST_PATTERNS.some(p => p.test('PATH'))).toBe(false);
  });
});

describe('buildSafeEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('includes allowlisted variables from process.env', () => {
    process.env['HOME'] = '/home/test';
    process.env['PATH'] = '/usr/bin';

    const env = buildSafeEnv();

    expect(env['HOME']).toBe('/home/test');
    expect(env['PATH']).toBe('/usr/bin');
  });

  it('excludes non-allowlisted variables', () => {
    process.env['MY_CUSTOM_VAR'] = 'value';

    const env = buildSafeEnv();

    expect(env['MY_CUSTOM_VAR']).toBeUndefined();
  });

  it('filters blocklisted variables even if allowlisted', () => {
    // SSH_AUTH_SOCK is allowlisted but TOKEN is blocklisted
    process.env['SSH_AUTH_SOCK'] = '/tmp/ssh-agent';
    const env = buildSafeEnv();
    expect(env['SSH_AUTH_SOCK']).toBe('/tmp/ssh-agent');
  });

  it('includes extra variables that pass blocklist', () => {
    const env = buildSafeEnv({ CUSTOM_FLAG: 'true' });

    expect(env['CUSTOM_FLAG']).toBe('true');
  });

  it('filters extra variables against blocklist', () => {
    const env = buildSafeEnv({ MY_SECRET: 'hidden', SAFE_VAR: 'visible' });

    expect(env['MY_SECRET']).toBeUndefined();
    expect(env['SAFE_VAR']).toBe('visible');
  });
});
