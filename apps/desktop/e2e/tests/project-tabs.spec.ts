import { test, expect } from 'playwright/test';
import * as path from 'path';
import { launchApp, closeApp, type AppFixture } from '../fixtures/electron-app';
import {
  openProject,
  waitForAppReady,
  createSecondProject,
  countProjectTabs,
  screenshotOnFailure,
} from '../fixtures/helpers';

test.describe('Project Tabs', () => {
  let fixture: AppFixture;
  let projectPath1: string;
  let projectPath2: string;

  test.beforeAll(async () => {
    fixture = await launchApp();
    await waitForAppReady(fixture.page);

    // Set up project paths
    projectPath1 = path.join(fixture.tempDir, 'project');
    projectPath2 = createSecondProject(fixture);
  });

  test.afterAll(async () => {
    await closeApp(fixture);
  });

  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    await screenshotOnFailure(fixture, testInfo);
  });

  test('should create a new project tab', async () => {
    const page = fixture.page;

    // Open the first project
    await openProject(page, projectPath1);

    // Verify there is 1 tab
    const tabCount1 = await countProjectTabs(page);
    expect(tabCount1).toBe(1);

    // Open the second project as a new tab
    await openProject(page, projectPath2);

    // Verify there are now 2 tabs
    const tabCount2 = await countProjectTabs(page);
    expect(tabCount2).toBe(2);
  });

  test('should switch between project tabs and show correct sessions', async () => {
    const page = fixture.page;

    // Get tab references using the truncated label text in project-tabs
    const tabLabels = page.locator('[data-testid="project-tabs"] span.truncate');
    const tabCount = await tabLabels.count();
    expect(tabCount).toBe(2);

    // Click the first tab to ensure it's active
    await tabLabels.nth(0).click();
    await page.waitForFunction(
      () => {
        const stores = (window as any).__testStores;
        if (!stores?.workspace) return false;
        const state = stores.workspace.getState();
        return state.activeTabId === state.tabs[0]?.id;
      },
      { timeout: 10_000 }
    );

    // Create a session in tab 1
    const addButton1 = page.locator(
      '[data-testid="add-session-button"], [aria-label="Add session"]'
    );
    await addButton1.first().click();

    // Verify the slot defaults to plain mode (Claude CLI not available in test env)
    await expect(page.locator('[data-testid="ai-mode-label"]').first()).toHaveText('Plain', {
      timeout: 5_000,
    });

    const launchButton = page.locator('[data-testid="launch-button"]');
    await expect(launchButton).toBeEnabled({ timeout: 5_000 });
    await launchButton.click();

    // Wait for session card to appear in tab 1
    await page.waitForSelector('[data-testid^="session-card-"]', { timeout: 30_000 });
    const tab1Sessions = await page.locator('[data-testid^="session-card-"]').count();
    expect(tab1Sessions).toBeGreaterThanOrEqual(1);

    // Switch to the second tab
    await tabLabels.nth(1).click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="session-card-"]').length === 0,
      { timeout: 10_000 }
    );

    // Verify: no session cards in tab 2 (sessions are scoped per project)
    const tab2Sessions = await page.locator('[data-testid^="session-card-"]').count();
    expect(tab2Sessions).toBe(0);

    // Create a session in tab 2
    const addButton2 = page.locator(
      '[data-testid="add-session-button"], [aria-label="Add session"]'
    );
    await addButton2.first().click();

    await expect(launchButton).toBeEnabled({ timeout: 5_000 });
    await launchButton.click();

    // Wait for session card in tab 2
    await page.waitForSelector('[data-testid^="session-card-"]', { timeout: 30_000 });
    const tab2SessionsAfter = await page.locator('[data-testid^="session-card-"]').count();
    expect(tab2SessionsAfter).toBeGreaterThanOrEqual(1);

    // Switch back to tab 1
    await tabLabels.nth(0).click();
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="session-card-"]').length >= 1,
      { timeout: 10_000 }
    );

    // Verify: tab 1's session is still visible
    const tab1SessionsAfter = await page.locator('[data-testid^="session-card-"]').count();
    expect(tab1SessionsAfter).toBeGreaterThanOrEqual(1);
  });
});
