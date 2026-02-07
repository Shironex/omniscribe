import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { Page } from 'playwright';
import type { AppFixture } from './electron-app';

/**
 * Open a project directory as a workspace tab by calling the workspace store's
 * openProject method from the renderer. Bypasses the native Electron file dialog.
 *
 * This uses the Zustand store exposed on window.__testStores.workspace to ensure
 * the frontend state updates correctly (not just the backend).
 */
export async function openProject(page: Page, projectPath: string): Promise<void> {
  await page.evaluate((dirPath: string) => {
    const stores = (window as unknown as Record<string, unknown>).__testStores as
      | {
          workspace: { getState: () => { openProject: (path: string) => void } };
        }
      | undefined;

    if (!stores?.workspace) {
      throw new Error('Test stores not available -- ensure the app is built with store exposure');
    }

    // Call the workspace store's openProject method which handles both
    // backend communication AND frontend state updates
    stores.workspace.getState().openProject(dirPath);
  }, projectPath);

  // Wait for the tab to appear in the UI.
  // The openProject method emits workspace:add-tab and updates state via callback.
  await page.waitForFunction(
    (expectedPath: string) => {
      const stores = (window as unknown as Record<string, unknown>).__testStores as
        | {
            workspace: { getState: () => { tabs: Array<{ projectPath: string }> } };
          }
        | undefined;
      if (!stores?.workspace) return false;
      const tabs = stores.workspace.getState().tabs;
      return tabs.some(t => t.projectPath === expectedPath);
    },
    projectPath,
    { timeout: 10_000 }
  );

  // Wait for the new tab to be rendered in the UI
  await page.waitForFunction(
    (expectedPath: string) => {
      const tabLabels = document.querySelectorAll('[data-testid="project-tabs"] span.truncate');
      return Array.from(tabLabels).some(el =>
        el.textContent?.includes(expectedPath.split('/').pop() ?? '')
      );
    },
    projectPath,
    { timeout: 10_000 }
  );
}

/**
 * Count the number of project tabs visible in the UI.
 */
export async function countProjectTabs(page: Page): Promise<number> {
  // Use the workspace store to get the authoritative tab count
  return page.evaluate(() => {
    const stores = (window as unknown as Record<string, unknown>).__testStores as
      | {
          workspace: { getState: () => { tabs: Array<unknown> } };
        }
      | undefined;
    return stores?.workspace?.getState().tabs.length ?? 0;
  });
}

/**
 * Wait for the app to be fully initialized (connected to backend, ready for interaction).
 */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="app-ready"]', { timeout: 30_000 });
}

/**
 * Create an additional isolated git project directory for multi-tab testing.
 * Returns the path to the new project directory.
 */
export function createSecondProject(fixture: AppFixture): string {
  const projectDir = path.join(fixture.tempDir, 'project2');
  fs.mkdirSync(projectDir, { recursive: true });

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

  return projectDir;
}

/**
 * Take a screenshot on test failure. Use in afterEach hooks.
 */
export async function screenshotOnFailure(
  fixture: AppFixture | undefined,
  testInfo: {
    status?: string;
    expectedStatus?: string;
    title: string;
    attachments: Array<{ name: string; path: string; contentType: string }>;
  }
): Promise<void> {
  if (testInfo.status !== testInfo.expectedStatus && fixture?.page) {
    const screenshotPath = `e2e/test-results/failure-${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.png`;
    await fixture.page.screenshot({ path: screenshotPath });
    testInfo.attachments.push({
      name: 'screenshot',
      path: screenshotPath,
      contentType: 'image/png',
    });
  }
}
