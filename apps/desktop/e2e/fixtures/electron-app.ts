import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

export interface AppFixture {
  electronApp: ElectronApplication;
  page: Page;
  tempDir: string;
  userDataDir: string;
}

/**
 * Launch the Electron app in an isolated environment for E2E testing.
 * Creates a temporary directory with isolated userData and a minimal git repo.
 */
export async function launchApp(): Promise<AppFixture> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniscribe-e2e-'));
  const userDataDir = path.join(tempDir, 'userData');
  const projectDir = path.join(tempDir, 'project');

  // Create isolated directories
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  // Initialize a minimal git repo so workspace features work
  execSync('git init', { cwd: projectDir, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', {
    cwd: projectDir,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'E2E Test',
      GIT_AUTHOR_EMAIL: 'e2e@test.local',
      GIT_COMMITTER_NAME: 'E2E Test',
      GIT_COMMITTER_EMAIL: 'e2e@test.local',
    },
  });

  const entryPoint = path.join(__dirname, '../../dist/main/index.js');

  // Disable Chromium sandbox in CI -- GitHub Actions runners lack the kernel
  // features (unprivileged user namespaces) required by the Chromium sandbox.
  const isCI = !!process.env.CI;

  const electronApp = await electron.launch({
    args: [entryPoint, ...(isCI ? ['--no-sandbox'] : [])],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_USER_DATA_DIR: userDataDir,
    },
    timeout: 60_000,
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 30_000 });

  return { electronApp, page, tempDir, userDataDir };
}

/**
 * Close the Electron app and clean up the temporary directory.
 */
export async function closeApp(fixture: AppFixture): Promise<void> {
  try {
    await fixture.electronApp.close();
  } catch {
    // App may already be closed
  }
  try {
    fs.rmSync(fixture.tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Reset the app state by reloading the page and waiting for the app-ready indicator.
 */
export async function resetAppState(fixture: AppFixture): Promise<void> {
  await fixture.page.reload();
  await fixture.page.waitForLoadState('domcontentloaded');
  await fixture.page.waitForSelector('[data-testid="app-ready"]', { timeout: 15_000 });
}
