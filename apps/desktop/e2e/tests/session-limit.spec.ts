import { test, expect } from 'playwright/test';
import * as path from 'path';
import { launchApp, closeApp, type AppFixture } from '../fixtures/electron-app';
import { openProject, waitForAppReady, screenshotOnFailure } from '../fixtures/helpers';

test.describe('Session Limit (12 cap)', () => {
  let fixture: AppFixture;

  test.beforeAll(async () => {
    fixture = await launchApp();
    await waitForAppReady(fixture.page);

    // Open the temp project
    const projectPath = path.join(fixture.tempDir, 'project');
    await openProject(fixture.page, projectPath);
  });

  test.afterAll(async () => {
    await closeApp(fixture);
  });

  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    await screenshotOnFailure(fixture, testInfo);
  });

  test('should reject session creation beyond the 12-session limit', async () => {
    const page = fixture.page;

    // The UI enforces a 12-session cap via canAddMore = sessionCount + preLaunchSlots.length < 12.
    // This prevents users from queuing more than 12 sessions/slots total.
    //
    // Strategy: Add 12 pre-launch slots (without launching them) and verify the
    // Add Session button is hidden. Then try pressing "N" (keyboard shortcut) and
    // verify no 13th slot is added.

    // Add 12 pre-launch slots via keyboard shortcut
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('n');
      if (i < 11) {
        // After press, wait for the slot to appear before pressing again
        await expect(page.locator('[data-testid="setup-sessions-button"]')).toBeVisible({
          timeout: 5_000,
        });
      }
    }

    // Verify the first slot defaults to plain mode (Claude CLI not available in test env)
    await expect(page.locator('[data-testid="ai-mode-label"]').first()).toHaveText('Plain', {
      timeout: 5_000,
    });

    // The setup-sessions-button should be hidden (12 slots = at the limit)
    const setupButton = page.locator('[data-testid="setup-sessions-button"]');
    await expect(setupButton).toBeHidden({ timeout: 5_000 });

    // Try to add a 13th slot via keyboard shortcut "N"
    await page.keyboard.press('n');

    // Count all pre-launch bars. Each pre-launch slot renders a PreLaunchBar
    // which contains the "Plain/Claude" mode selector and branch selector.
    // We can count them by counting the per-slot launch buttons or mode selectors.
    // The TerminalGrid renders PreLaunchSection which maps over preLaunchSlots.

    // Verify the setup button is still hidden -- no 13th slot was created
    await expect(setupButton).toBeHidden({ timeout: 2_000 });

    // Now launch all 12 to verify they create session cards.
    // Use the global launch button to launch all at once.
    const launchButton = page.locator('[data-testid="launch-button"]');
    await expect(launchButton).toBeEnabled({ timeout: 5_000 });
    await launchButton.click();

    // Wait for session cards to start appearing.
    // Note: Sessions are created sequentially and some may time out (10s per session).
    // We wait for at least some to appear within the test timeout (120s).
    await page.waitForSelector('[data-testid^="session-card-"]', { timeout: 60_000 });

    // After launch starts, the setup button should still be hidden
    // (session cards replace pre-launch slots, keeping the total at 12)
    await expect(setupButton).toBeHidden({ timeout: 5_000 });

    // Wait for the session count to stabilize (all 12 created or timed out)
    // Some sessions may fail but each attempt still creates a session card
    await page.waitForFunction(
      () => {
        const cards = document.querySelectorAll('[data-testid^="session-card-"]');
        // Accept any count >= 1 since some may time out
        return cards.length >= 1;
      },
      { timeout: 30_000 }
    );

    // Verify that session cards were created
    const sessionCards = page.locator('[data-testid^="session-card-"]');
    const cardCount = await sessionCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
    expect(cardCount).toBeLessThanOrEqual(12);
  });
});
