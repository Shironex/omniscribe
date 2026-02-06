import { test, expect } from 'playwright/test';
import * as path from 'path';
import { launchApp, closeApp, type AppFixture } from '../fixtures/electron-app';
import { openProject, waitForAppReady, screenshotOnFailure } from '../fixtures/helpers';

test.describe('Reconnection Overlay', () => {
  let fixture: AppFixture;

  test.beforeAll(async () => {
    fixture = await launchApp();
    await waitForAppReady(fixture.page);

    // Open a project and create a session so the terminal card (with overlay) is rendered.
    // The ReconnectionOverlay is a child of TerminalCard, so we need at least one session.
    const projectPath = path.join(fixture.tempDir, 'project');
    await openProject(fixture.page, projectPath);

    const page = fixture.page;

    // Add and launch a session
    const addButton = page.locator(
      '[data-testid="add-session-button"], [aria-label="Add session"]'
    );
    await addButton.first().click();

    const launchButton = page.locator('[data-testid="launch-button"]');
    await expect(launchButton).toBeEnabled({ timeout: 5_000 });
    await launchButton.click();

    // Wait for session card to appear (the terminal may fail to launch but
    // the card + overlay component still mount)
    await page.waitForSelector('[data-testid^="session-card-"]', { timeout: 30_000 });
  });

  test.afterAll(async () => {
    await closeApp(fixture);
  });

  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    await screenshotOnFailure(fixture, testInfo);
  });

  test('should show reconnection overlay when socket disconnects', async () => {
    const page = fixture.page;

    // Verify the reconnection overlay is NOT visible initially (connected state)
    const overlay = page.locator('[data-testid="reconnection-overlay"]');
    await expect(overlay).toBeHidden({ timeout: 5_000 });

    // Trigger a disconnect by closing the underlying engine transport.
    // socket.io.engine.close() triggers disconnect with reason 'transport close',
    // which the ConnectionStore treats as an unexpected disconnect and shows the overlay.
    // (Unlike socket.disconnect() which triggers 'io client disconnect' -- ignored by the store.)
    await page.evaluate(() => {
      const socket = (window as unknown as Record<string, unknown>).__testSocket as
        | {
            io: { engine: { close: () => void } };
          }
        | undefined;

      if (!socket) {
        throw new Error('Test socket not available');
      }

      socket.io.engine.close();
    });

    // Wait for the reconnection overlay to appear
    await expect(overlay).toBeVisible({ timeout: 15_000 });

    // Verify the overlay contains reconnection-related text
    const overlayText = await overlay.textContent();
    expect(overlayText).toMatch(/Reconnect|Connection lost/i);
  });

  test('should hide reconnection overlay when connection is restored', async () => {
    const page = fixture.page;

    // The overlay should be visible from the previous test (or auto-reconnect
    // may have already resolved it). Either outcome validates the behavior.
    const overlay = page.locator('[data-testid="reconnection-overlay"]');

    const isCurrentlyVisible = await overlay.isVisible();

    if (isCurrentlyVisible) {
      // Wait for the overlay to disappear as socket.io auto-reconnects.
      // The server is still running so the client will reconnect automatically.
      await expect(overlay).toBeHidden({ timeout: 30_000 });
    }

    // After reconnection, the overlay should be hidden
    // (Playwright retries until the reconnected flash animation completes)
    await expect(overlay).toBeHidden({ timeout: 5_000 });
  });
});
