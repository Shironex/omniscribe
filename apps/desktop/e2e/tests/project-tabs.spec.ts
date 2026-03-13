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

    // Use semantic role-based locators — the ProjectTabs component renders
    // role="tab" on each tab element. Auto-retrying assertion avoids flaky
    // races where the DOM hasn't yet reflected the store update.
    const tabLabels = page.getByTestId('project-tabs').getByRole('tab');
    await expect(tabLabels).toHaveCount(2, { timeout: 10_000 });

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

    // Create a session in tab 1 (press N to add a pre-launch slot)
    await page.keyboard.press('n');

    // Verify the slot shows a valid AI mode label (depends on whether Claude CLI is installed)
    await expect(page.locator('[data-testid="ai-mode-label"]').first()).toHaveText(
      /^(Plain|Claude( Code)?)$/,
      {
        timeout: 5_000,
      }
    );

    const launchButton = page.locator('[data-testid="launch-button"]');
    await expect(launchButton).toBeEnabled({ timeout: 5_000 });
    await launchButton.click();

    // Wait for session card to appear in tab 1
    // Use :visible to ignore hidden cards from inactive PersistentProjectGrids
    const visibleCards = page.locator('[data-testid^="session-card-"]:visible');
    await visibleCards.first().waitFor({ timeout: 30_000 });
    const tab1Sessions = await visibleCards.count();
    expect(tab1Sessions).toBeGreaterThanOrEqual(1);

    // Switch to the second tab
    await tabLabels.nth(1).click();
    await expect(visibleCards).toHaveCount(0, { timeout: 10_000 });

    // Verify: no visible session cards in tab 2 (sessions are scoped per project)
    const tab2Sessions = await visibleCards.count();
    expect(tab2Sessions).toBe(0);

    // Create a session in tab 2 (press N to add a pre-launch slot)
    await page.keyboard.press('n');

    await expect(launchButton).toBeEnabled({ timeout: 5_000 });
    await launchButton.click();

    // Wait for session card in tab 2
    await visibleCards.first().waitFor({ timeout: 30_000 });
    const tab2SessionsAfter = await visibleCards.count();
    expect(tab2SessionsAfter).toBeGreaterThanOrEqual(1);

    // Switch back to tab 1
    await tabLabels.nth(0).click();
    await visibleCards.first().waitFor({ timeout: 10_000 });

    // Verify: tab 1's session is still visible
    const tab1SessionsAfter = await visibleCards.count();
    expect(tab1SessionsAfter).toBeGreaterThanOrEqual(1);
  });
});
