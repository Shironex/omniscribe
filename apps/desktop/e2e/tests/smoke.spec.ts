import { test, expect } from 'playwright/test';
import { launchApp, closeApp, type AppFixture } from '../fixtures/electron-app';

test.describe('Smoke Test', () => {
  let fixture: AppFixture;

  test.beforeAll(async () => {
    fixture = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(fixture);
  });

  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && fixture?.page) {
      const screenshotPath = `e2e/test-results/failure-${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}.png`;
      await fixture.page.screenshot({ path: screenshotPath });
      testInfo.attachments.push({
        name: 'screenshot',
        path: screenshotPath,
        contentType: 'image/png',
      });
    }
  });

  test('should launch the app and show the main window', async () => {
    expect(fixture.page).not.toBeNull();

    const title = await fixture.page.title();
    expect(title).toContain('Omniscribe');

    const appReady = fixture.page.locator('[data-testid="app-ready"]');
    await expect(appReady).toBeVisible({ timeout: 15_000 });
  });

  test('should have a visible project tabs area', async () => {
    const projectTabs = fixture.page.locator('[data-testid="project-tabs"]');
    await expect(projectTabs).toBeVisible({ timeout: 15_000 });
  });
});
