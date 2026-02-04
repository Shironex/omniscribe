import { BrowserWindow, ipcMain, dialog, app } from 'electron';
import Store from 'electron-store';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { homedir } from 'os';
import * as semver from 'semver';
import type {
  ClaudeCliStatus,
  GhCliStatus,
  GhCliAuthStatus,
  ClaudeVersionCheckResult,
  ClaudeVersionList,
  ClaudeInstallCommandOptions,
  ClaudeInstallCommand,
} from '@omniscribe/shared';

const store = new Store();
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Supported CLI tools to check for
 */
const CLI_TOOLS = ['claude', 'npm', 'node', 'git', 'pnpm', 'yarn', 'gh'] as const;
type CLITool = (typeof CLI_TOOLS)[number];

/**
 * Check if a CLI tool is available
 */
async function checkCliAvailable(tool: CLITool): Promise<boolean> {
  const { execSync } = await import('child_process');
  try {
    execSync(`${tool} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Claude CLI Detection Utilities
// ============================================

/**
 * Normalize path separators
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Join paths and normalize
 */
function joinPaths(...paths: string[]): string {
  return normalizePath(join(...paths));
}

/**
 * Get Claude config directory (~/.claude)
 */
function getClaudeConfigDir(): string {
  return joinPaths(homedir(), '.claude');
}

/**
 * Get paths to Claude credential files
 */
function getClaudeCredentialPaths(): string[] {
  const claudeDir = getClaudeConfigDir();
  return [
    joinPaths(claudeDir, '.credentials.json'),
    joinPaths(claudeDir, 'credentials.json'),
  ];
}

/**
 * Get common Claude CLI installation paths (cross-platform)
 */
function getClaudeCliPaths(): string[] {
  const home = normalizePath(homedir());
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const appData = process.env['APPDATA'] || joinPaths(home, 'AppData/Roaming');
    const localAppData = process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
    return [
      joinPaths(home, '.local/bin/claude.exe'),
      joinPaths(appData, 'npm/claude.cmd'),
      joinPaths(appData, 'npm/claude'),
      joinPaths(localAppData, 'Programs/claude/claude.exe'),
    ];
  }

  // Unix (macOS/Linux)
  return [
    joinPaths(home, '.local/bin/claude'),
    '/usr/local/bin/claude',
    joinPaths(home, '.npm-global/bin/claude'),
  ];
}

interface CliDetectionResult {
  cliPath?: string;
  method: 'path' | 'local' | 'none';
}

/**
 * Find Claude CLI installation
 */
async function findClaudeCli(): Promise<CliDetectionResult> {
  const platform = process.platform;

  // Try to find CLI in PATH first
  try {
    const command = platform === 'win32' ? 'where claude' : 'which claude';
    const { stdout } = await execAsync(command);
    // Take first line (Windows 'where' may return multiple results)
    const firstPath = stdout.trim().split('\n')[0]?.trim();
    if (firstPath) {
      return { cliPath: firstPath, method: 'path' };
    }
  } catch {
    // Not in PATH, fall through to check common locations
  }

  // Check common installation locations
  const localPaths = getClaudeCliPaths();
  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return { cliPath: localPath, method: 'local' };
    }
  }

  return { method: 'none' };
}

/**
 * Get Claude CLI version
 */
async function getClaudeCliVersion(cliPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cliPath, ['--version']);
    return stdout.trim();
  } catch {
    return undefined;
  }
}

/**
 * Check Claude CLI authentication status
 */
async function checkClaudeAuth(): Promise<{ authenticated: boolean }> {
  const credentialPaths = getClaudeCredentialPaths();

  for (const credPath of credentialPaths) {
    if (!existsSync(credPath)) {
      continue;
    }

    try {
      const content = readFileSync(credPath, 'utf-8');
      const credentials: unknown = JSON.parse(content);

      // Validate that credentials is an object
      if (typeof credentials !== 'object' || credentials === null) {
        continue;
      }

      const creds = credentials as Record<string, unknown>;

      // Check for OAuth token in various locations
      const claudeAiOauth = creds['claudeAiOauth'] as Record<string, unknown> | undefined;
      const hasToken =
        (typeof claudeAiOauth?.['accessToken'] === 'string' &&
          claudeAiOauth['accessToken'].length > 0) ||
        (typeof creds['oauth_token'] === 'string' && creds['oauth_token'].length > 0) ||
        (typeof creds['accessToken'] === 'string' && creds['accessToken'].length > 0);

      if (hasToken) {
        return { authenticated: true };
      }
    } catch {
      // Failed to read credentials
    }
  }

  return { authenticated: false };
}

/**
 * Get full Claude CLI status
 */
async function getClaudeCliStatus(): Promise<ClaudeCliStatus> {
  const platform = process.platform;
  const arch = process.arch;

  const { cliPath, method } = await findClaudeCli();
  const version = cliPath ? await getClaudeCliVersion(cliPath) : undefined;
  const auth = await checkClaudeAuth();

  return {
    installed: !!cliPath,
    path: cliPath,
    version,
    method: method === 'none' ? undefined : method,
    platform,
    arch,
    auth,
  };
}

// ============================================
// GitHub CLI Detection Utilities
// ============================================

/**
 * Get common gh CLI installation paths (cross-platform)
 */
function getGhCliPaths(): string[] {
  const home = normalizePath(homedir());
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const localAppData =
      process.env['LOCALAPPDATA'] || joinPaths(home, 'AppData/Local');
    return [
      joinPaths(programFiles, 'GitHub CLI/gh.exe'),
      joinPaths(localAppData, 'Programs/GitHub CLI/gh.exe'),
      joinPaths(home, 'scoop/shims/gh.exe'),
      joinPaths(home, '.local/bin/gh.exe'),
    ];
  }

  // macOS and Linux
  const isMac = process.platform === 'darwin';
  const isLinux = process.platform === 'linux';
  return [
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    ...(isMac ? ['/opt/homebrew/bin/gh'] : []),
    joinPaths(home, '.local/bin/gh'),
    ...(isLinux ? ['/snap/bin/gh'] : []),
  ];
}

interface GhCliDetectionResult {
  cliPath?: string;
  method: 'path' | 'local' | 'none';
}

/**
 * Find gh CLI installation
 */
async function findGhCli(): Promise<GhCliDetectionResult> {
  const platform = process.platform;

  // Try to find CLI in PATH first
  try {
    const command = platform === 'win32' ? 'where gh' : 'which gh';
    const { stdout } = await execAsync(command);
    const firstPath = stdout.trim().split('\n')[0]?.trim();
    if (firstPath) {
      return { cliPath: firstPath, method: 'path' };
    }
  } catch {
    // Not in PATH, fall through to check common locations
  }

  // Check common installation locations
  const localPaths = getGhCliPaths();
  for (const localPath of localPaths) {
    if (existsSync(localPath)) {
      return { cliPath: localPath, method: 'local' };
    }
  }

  return { method: 'none' };
}

/**
 * Get gh CLI version
 */
async function getGhCliVersion(cliPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(cliPath, ['--version']);
    const match = stdout.match(/gh version ([^\s(]+)/);
    return match ? match[1] : stdout.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

/**
 * Check gh CLI authentication status
 */
async function checkGhAuth(cliPath: string): Promise<GhCliAuthStatus> {
  try {
    const { stdout, stderr } = await execFileAsync(cliPath, ['auth', 'status'], {
      timeout: 10000,
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: '1',
        NO_COLOR: '1',
      },
    });
    const output = stdout + stderr;

    if (output.includes('Logged in to')) {
      const usernameMatch = output.match(
        /Logged in to [^\s]+ account ([^\s(]+)/,
      );
      const username = usernameMatch ? usernameMatch[1] : undefined;

      const scopesMatch = output.match(/Token scopes: ([^\n]+)/);
      const scopes = scopesMatch
        ? scopesMatch[1]
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

      return { authenticated: true, username, scopes };
    }

    return { authenticated: false };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    if (
      errorMessage.includes('not logged in') ||
      errorMessage.includes('no authentication') ||
      errorMessage.includes('You are not logged')
    ) {
      return { authenticated: false };
    }

    return { authenticated: false };
  }
}

/**
 * Get full GitHub CLI status
 */
async function getGhCliStatus(): Promise<GhCliStatus> {
  const platform = process.platform;
  const arch = process.arch;

  const { cliPath, method } = await findGhCli();

  if (!cliPath || method === 'none') {
    return {
      installed: false,
      platform,
      arch,
      auth: { authenticated: false },
    };
  }

  const version = await getGhCliVersion(cliPath);
  const auth = await checkGhAuth(cliPath);

  return {
    installed: true,
    path: cliPath,
    version,
    method,
    platform,
    arch,
    auth,
  };
}

// ============================================
// Claude CLI Version Check Utilities
// ============================================

/** Cache for latest version info */
let cachedLatestVersion: { version: string; timestamp: number } | null = null;
/** Cache for version list */
let cachedVersionList: { versions: string[]; timestamp: number } | null = null;
/** Cache duration for latest version (24 hours) */
const LATEST_VERSION_CACHE_MS = 24 * 60 * 60 * 1000;
/** Cache duration for version list (1 hour) */
const VERSION_LIST_CACHE_MS = 60 * 60 * 1000;

/**
 * Fetch latest version from npm registry
 */
async function fetchLatestVersion(): Promise<string | null> {
  // Check cache first
  if (
    cachedLatestVersion &&
    Date.now() - cachedLatestVersion.timestamp < LATEST_VERSION_CACHE_MS
  ) {
    return cachedLatestVersion.version;
  }

  try {
    const response = await fetch(
      'https://registry.npmjs.org/@anthropic-ai/claude-code/latest',
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { version?: string };
    const version = data.version;

    if (version) {
      cachedLatestVersion = { version, timestamp: Date.now() };
      return version;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch latest Claude CLI version:', error);
    // Return cached value if available, even if expired
    return cachedLatestVersion?.version ?? null;
  }
}

/**
 * Fetch available versions from npm registry
 */
async function fetchAvailableVersions(limit = 20): Promise<string[]> {
  // Check cache first
  if (
    cachedVersionList &&
    Date.now() - cachedVersionList.timestamp < VERSION_LIST_CACHE_MS
  ) {
    return cachedVersionList.versions.slice(0, limit);
  }

  try {
    const response = await fetch(
      'https://registry.npmjs.org/@anthropic-ai/claude-code',
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { versions?: Record<string, unknown> };
    const versions = Object.keys(data.versions || {});

    // Sort by semver descending (newest first) and filter out pre-release versions
    const sortedVersions = versions
      .filter((v) => semver.valid(v) && !semver.prerelease(v))
      .sort((a, b) => semver.rcompare(a, b));

    cachedVersionList = { versions: sortedVersions, timestamp: Date.now() };
    return sortedVersions.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch available Claude CLI versions:', error);
    // Return cached value if available, even if expired
    return cachedVersionList?.versions.slice(0, limit) ?? [];
  }
}

/**
 * Get platform-specific install command for Claude CLI
 */
function getInstallCommand(options: ClaudeInstallCommandOptions): ClaudeInstallCommand {
  const { isUpdate, version } = options;
  const platform = process.platform;
  const isWindows = platform === 'win32';

  if (!isUpdate) {
    // Fresh install
    if (isWindows) {
      return {
        command: 'irm https://claude.ai/install.ps1 | iex',
        description: 'Install Claude CLI via PowerShell',
      };
    }
    return {
      command: 'curl -fsSL https://claude.ai/install.sh | bash -s -- latest',
      description: 'Install Claude CLI via shell script',
    };
  }

  // Update or specific version install
  const versionArg = version || 'latest';

  if (isWindows) {
    return {
      command: `taskkill /IM claude.exe /F 2>$null; claude install --force ${versionArg}`,
      description: version
        ? `Update Claude CLI to version ${version}`
        : 'Update Claude CLI to latest version',
    };
  }

  return {
    command: `pkill -x claude 2>/dev/null; sleep 1; claude install --force ${versionArg}`,
    description: version
      ? `Update Claude CLI to version ${version}`
      : 'Update Claude CLI to latest version',
  };
}

/**
 * Open an external terminal and run a command
 */
async function openTerminalWithCommand(command: string): Promise<void> {
  const platform = process.platform;

  let terminalCommand: string;

  if (platform === 'win32') {
    // Windows: Open PowerShell with the command
    // Use -NoExit to keep the window open after the command completes
    const escapedCommand = command.replace(/"/g, '\\"');
    terminalCommand = `start powershell -NoExit -Command "${escapedCommand}"`;
  } else if (platform === 'darwin') {
    // macOS: Use osascript to open Terminal.app
    const escapedCommand = command.replace(/"/g, '\\"').replace(/'/g, "'\\''");
    terminalCommand = `osascript -e 'tell app "Terminal" to do script "${escapedCommand}"' -e 'tell app "Terminal" to activate'`;
  } else {
    // Linux: Try common terminal emulators
    const escapedCommand = command.replace(/"/g, '\\"');
    // Try gnome-terminal first, then konsole, then xterm as fallback
    terminalCommand = `gnome-terminal -- bash -c "${escapedCommand}; exec bash" 2>/dev/null || konsole -e bash -c "${escapedCommand}; exec bash" 2>/dev/null || xterm -hold -e "${escapedCommand}"`;
  }

  await execAsync(terminalCommand);
}

/**
 * Extract clean semver from version strings like "2.1.31 (Claude Code)"
 */
function cleanVersionString(version: string): string | null {
  // Use semver.coerce to extract version from strings like "2.1.31 (Claude Code)"
  const coerced = semver.coerce(version);
  return coerced ? coerced.version : null;
}

/**
 * Check version and return comparison result
 */
async function checkClaudeVersion(
  installedVersion?: string,
): Promise<ClaudeVersionCheckResult | null> {
  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    return null;
  }

  // Clean the installed version string (e.g., "2.1.31 (Claude Code)" -> "2.1.31")
  const cleanInstalled = installedVersion
    ? cleanVersionString(installedVersion)
    : null;

  const isOutdated = cleanInstalled
    ? semver.lt(cleanInstalled, latestVersion)
    : true;

  return {
    installedVersion: cleanInstalled ?? installedVersion,
    latestVersion,
    isOutdated,
    lastChecked: new Date().toISOString(),
  };
}

/**
 * Register all IPC handlers for the application
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ============================================
  // Window Control Handlers
  // ============================================

  ipcMain.on('window:minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow.close();
  });

  ipcMain.handle('window:is-maximized', () => {
    return mainWindow.isMaximized();
  });

  // Forward window state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:maximized-change', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:maximized-change', false);
  });

  // ============================================
  // Dialog Handlers
  // ============================================

  ipcMain.handle('dialog:open-directory', async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      ...options,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:open-file', async (_event, options?: Electron.OpenDialogOptions) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      ...options,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(
    'dialog:message',
    async (
      _event,
      options: {
        type?: 'none' | 'info' | 'error' | 'question' | 'warning';
        title?: string;
        message: string;
        detail?: string;
        buttons?: string[];
      }
    ) => {
      const result = await dialog.showMessageBox(mainWindow, {
        type: options.type ?? 'info',
        title: options.title ?? 'Omniscribe',
        message: options.message,
        detail: options.detail,
        buttons: options.buttons ?? ['OK'],
      });
      return result.response;
    }
  );

  // ============================================
  // Store Handlers
  // ============================================

  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key);
  });

  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    store.set(key, value);
  });

  ipcMain.handle('store:delete', (_event, key: string) => {
    store.delete(key);
  });

  ipcMain.handle('store:clear', () => {
    store.clear();
  });

  // ============================================
  // App Handlers
  // ============================================

  ipcMain.handle('app:get-path', (_event, name: Parameters<typeof app.getPath>[0]) => {
    return app.getPath(name);
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:check-cli', async (_event, tool: CLITool) => {
    if (!CLI_TOOLS.includes(tool)) {
      throw new Error(`Unknown CLI tool: ${tool}`);
    }
    return checkCliAvailable(tool);
  });

  ipcMain.handle('app:is-valid-project', async (_event, projectPath: string) => {
    // Check if path exists and has common project indicators
    if (!existsSync(projectPath)) {
      return { valid: false, reason: 'Path does not exist' };
    }

    const indicators = ['package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml', '.git'];
    const hasIndicator = indicators.some((indicator) => existsSync(join(projectPath, indicator)));

    return {
      valid: hasIndicator,
      reason: hasIndicator ? undefined : 'No recognized project files found',
    };
  });

  // ============================================
  // Claude CLI Handlers
  // ============================================

  ipcMain.handle('claude:get-status', async () => {
    return getClaudeCliStatus();
  });

  ipcMain.handle('claude:check-version', async () => {
    const status = await getClaudeCliStatus();
    return checkClaudeVersion(status.version);
  });

  ipcMain.handle('claude:get-versions', async () => {
    const versions = await fetchAvailableVersions();
    return { versions } as ClaudeVersionList;
  });

  ipcMain.handle(
    'claude:get-install-command',
    async (_event, options: ClaudeInstallCommandOptions) => {
      return getInstallCommand(options);
    },
  );

  ipcMain.handle('claude:run-install', async (_event, command: string) => {
    await openTerminalWithCommand(command);
  });

  // ============================================
  // GitHub CLI Handlers
  // ============================================

  ipcMain.handle('github:get-status', async () => {
    return getGhCliStatus();
  });
}

/**
 * Clean up IPC handlers (call on app quit)
 */
export function cleanupIpcHandlers(): void {
  // Window handlers
  ipcMain.removeAllListeners('window:minimize');
  ipcMain.removeAllListeners('window:maximize');
  ipcMain.removeAllListeners('window:close');
  ipcMain.removeHandler('window:is-maximized');

  // Dialog handlers
  ipcMain.removeHandler('dialog:open-directory');
  ipcMain.removeHandler('dialog:open-file');
  ipcMain.removeHandler('dialog:message');

  // Store handlers
  ipcMain.removeHandler('store:get');
  ipcMain.removeHandler('store:set');
  ipcMain.removeHandler('store:delete');
  ipcMain.removeHandler('store:clear');

  // App handlers
  ipcMain.removeHandler('app:get-path');
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:check-cli');
  ipcMain.removeHandler('app:is-valid-project');

  // Claude handlers
  ipcMain.removeHandler('claude:get-status');
  ipcMain.removeHandler('claude:check-version');
  ipcMain.removeHandler('claude:get-versions');
  ipcMain.removeHandler('claude:get-install-command');
  ipcMain.removeHandler('claude:run-install');

  // GitHub handlers
  ipcMain.removeHandler('github:get-status');
}
