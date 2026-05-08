/**
 * Environment variable filtering for spawned processes.
 *
 * Only allowlisted variables from process.env are forwarded to child terminals,
 * and all variables are filtered through a blocklist to prevent leaking secrets.
 *
 * Canonical source — used by both the desktop app and provider plugins.
 * Moved from apps/desktop/src/modules/shared/env-utils.ts.
 */

// Environment variable allowlist for spawned terminal processes.
// Only these variables are forwarded from the host process.env to child terminals.
export const ENV_ALLOWLIST: string[] = [
  // Shell basics
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'LC_COLLATE',
  'LC_MONETARY',
  'LC_NUMERIC',
  'LC_TIME',
  // Path resolution
  'PATH',
  // Windows platform
  'COMSPEC',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'PROGRAMFILES',
  'PROGRAMFILES(X86)',
  'COMMONPROGRAMFILES',
  'USERPROFILE',
  // Temp directories
  'TMPDIR',
  'TMP',
  'TEMP',
  // macOS-specific
  'COMMAND_MODE',
  '__CF_USER_TEXT_ENCODING',
  // Display (Linux/X11/Wayland)
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_RUNTIME_DIR',
  'XDG_SESSION_TYPE',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'DBUS_SESSION_BUS_ADDRESS',
  // SSH
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  // Development tools (version managers, package managers)
  'NVM_DIR',
  'NVM_BIN',
  'NVM_INC',
  'VOLTA_HOME',
  'FNM_DIR',
  'FNM_MULTISHELL_PATH',
  'PNPM_HOME',
  'BUN_INSTALL',
  'GOPATH',
  'GOROOT',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'PYENV_ROOT',
  'RBENV_ROOT',
  'ASDF_DIR',
  'ASDF_DATA_DIR',
  'HOMEBREW_PREFIX',
  'HOMEBREW_CELLAR',
  'HOMEBREW_REPOSITORY',
  // Editor
  'EDITOR',
  'VISUAL',
  'TERM',
  'COLORTERM',
  // Git
  'GIT_EXEC_PATH',
  'GIT_TEMPLATE_DIR',
  // Proxy
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
];

// Patterns that must NEVER be passed to spawned processes, even if somehow in the allowlist.
export const ENV_BLOCKLIST_PATTERNS: RegExp[] = [
  /^ELECTRON_/i,
  /^NODE_OPTIONS$/i,
  /^NODE_EXTRA_CA_CERTS$/i,
  /SECRET/i,
  /PASSWORD/i,
  /TOKEN/i,
  /CREDENTIAL/i,
  /API_KEY/i,
  /PRIVATE_KEY/i,
  // Dynamic linker injection vectors (code execution via shared libraries)
  /^LD_PRELOAD$/i,
  /^LD_LIBRARY_PATH$/i,
  /^DYLD_/i,
  // Shell startup injection
  /^BASH_ENV$/i,
  /^ENV$/i,
  /^BASH_FUNC_/i,
  // ZDOTDIR redirects zsh startup-file lookup to an arbitrary directory,
  // letting an attacker run their .zshrc instead of the user's. Block
  // it on both inheritance and caller-extras paths.
  /^ZDOTDIR$/i,
];

/**
 * Caller-only blocklist (case-insensitive substring matches).
 *
 * These names ARE allowed to be inherited from `process.env` — the dev
 * shell needs them to find tools — but a remote caller providing them
 * via the `extra` arg of `buildSafeEnv` would let an attacker control
 * the spawned shell's PATH or runtime configuration. Block them only
 * on the caller path.
 */
const ENV_CALLER_BLOCKLIST = new Set<string>([
  'PATH',
  'HOME',
  'SHELL',
  'NVM_DIR',
  'NVM_BIN',
  'NVM_INC',
  'PNPM_HOME',
  'BUN_INSTALL',
  'HOMEBREW_PREFIX',
  'HOMEBREW_CELLAR',
  'HOMEBREW_REPOSITORY',
  'GOROOT',
  'GOPATH',
  'CARGO_HOME',
  'RUSTUP_HOME',
]);

function isCallerBlocked(key: string): boolean {
  return ENV_CALLER_BLOCKLIST.has(key.toUpperCase());
}

/**
 * Build a sanitized environment for spawned terminal processes.
 * Only allowlisted variables from process.env are included, and all variables
 * (including caller-provided extras) are filtered through the blocklist.
 *
 * `extra` (caller-provided overrides) is filtered through both the
 * primary blocklist and a caller-only blocklist that protects shell-
 * resolution variables. The caller blocklist does NOT apply to inherited
 * `process.env` values — the host shell still needs PATH/HOME/etc.
 */
export function buildSafeEnv(extra?: Record<string, string>): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined && !ENV_BLOCKLIST_PATTERNS.some(p => p.test(key))) {
      safeEnv[key] = value;
    }
  }
  if (extra) {
    // Extra env vars from callers (e.g., session-specific vars) are passed
    // through, but filtered by both the global blocklist AND a caller-only
    // blocklist that prevents remote callers from rewriting PATH/HOME/etc.
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value !== 'string') continue;
      if (ENV_BLOCKLIST_PATTERNS.some(p => p.test(key))) continue;
      if (isCallerBlocked(key)) continue;
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}
