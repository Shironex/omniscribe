#!/usr/bin/env node
/**
 * Attach to a running Omniscribe Electron app via CDP and screenshot the
 * top-level views for the README.
 *
 * Pre-req: launch the app with its renderer reachable over CDP:
 *
 *   pnpm dev:inspect        # exposes 127.0.0.1:9222 (--remote-allow-origins=*)
 *
 * Then, in another terminal:
 *
 *   pnpm screenshots
 *
 * For the "main" grid + "quick-actions" shots, open a project and launch a
 * few sessions BEFORE running this script — those views need live sessions.
 * The "settings" and "history" shots are captured automatically.
 *
 * Output: assets/screenshots/<view>.png
 *
 * Env overrides:
 *   CDP_URL          CDP endpoint (default http://127.0.0.1:9222)
 *   VIEWS            comma list to capture (default main,settings,history)
 *   SHOT_WIDTH       forced viewport width  (default 1400)
 *   SHOT_HEIGHT      forced viewport height (default 900)
 *   PLAYWRIGHT_PATH  explicit playwright module specifier
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

// playwright is a devDependency of @omniscribe/desktop, not the root. Resolve
// it from the desktop workspace so `pnpm screenshots` works from the repo root.
// We require() the CJS module from the desktop package context, which lets
// pnpm's symlinked store resolve playwright's own deps (playwright-core).
function loadChromium() {
  const fromContexts = [
    process.env.PLAYWRIGHT_PATH && import.meta.url, // resolve env spec from here
    resolve(process.cwd(), 'apps/desktop/package.json'), // pnpm-correct location
    import.meta.url, // hoisted / root fallback
  ].filter(Boolean);

  for (const ctx of fromContexts) {
    try {
      const req = createRequire(ctx);
      const spec =
        ctx === import.meta.url && process.env.PLAYWRIGHT_PATH
          ? process.env.PLAYWRIGHT_PATH
          : 'playwright';
      const chromium = req(spec).chromium;
      if (chromium) return chromium;
    } catch {
      // try next context
    }
  }
  throw new Error(
    'Could not load Playwright. Install it in apps/desktop (pnpm --filter @omniscribe/desktop add -D playwright) ' +
      'or set PLAYWRIGHT_PATH to a playwright module.'
  );
}

const CDP = process.env.CDP_URL ?? 'http://127.0.0.1:9222';
const VITE_DEV_PORT = 15174; // keep in sync with packages/shared/src/constants/app.ts
const OUT_ROOT = resolve(process.cwd(), 'assets/screenshots');
const WIDTH = Number.parseInt(process.env.SHOT_WIDTH ?? '1400', 10);
const HEIGHT = Number.parseInt(process.env.SHOT_HEIGHT ?? '900', 10);
const VIEWS = (process.env.VIEWS ?? 'main,settings,history')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const chromium = loadChromium();
const browser = await chromium.connectOverCDP(CDP);
const context = browser.contexts()[0];
if (!context) {
  console.error('No CDP context. Is the app running with `pnpm dev:inspect`?');
  process.exit(1);
}

const page =
  context.pages().find(p => p.url().startsWith(`http://localhost:${VITE_DEV_PORT}`)) ??
  context.pages().find(p => !p.url().startsWith('devtools://'));

if (!page) {
  console.error(
    `No renderer page found on CDP. Launch with \`pnpm dev:inspect\` (port from ${CDP}).`
  );
  process.exit(1);
}

console.log('attached to:', page.url(), '·', await page.title());

// Force a deterministic viewport over CDP. This sidesteps the dev-mode docked
// DevTools shrinking the rendered area, so every shot is a clean WIDTHxHEIGHT.
await page.setViewportSize({ width: WIDTH, height: HEIGHT });

const isMac = process.platform === 'darwin';
const mod = isMac ? 'Meta' : 'Control';

async function waitForReady() {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-testid="app-ready"]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
}

async function shot(view) {
  mkdirSync(OUT_ROOT, { recursive: true });
  const file = resolve(OUT_ROOT, `${view}.png`);
  await page.screenshot({ path: file });
  console.log('  ->', file);
}

// Close any open overlay (settings/history) so each capture starts clean.
async function closeOverlays() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

const CAPTURE = {
  // The hero shot — whatever is currently on screen. Arrange a project +
  // sessions before running for the multi-session grid.
  async main() {
    await closeOverlays();
    await page.waitForTimeout(400);
    await shot('main');
  },

  async settings() {
    await page.keyboard.press(`${mod}+Comma`);
    await page.waitForTimeout(700);
    await shot('settings');
    await page.keyboard.press(`${mod}+Comma`); // toggle closed
    await page.waitForTimeout(300);
  },

  async history() {
    await page.keyboard.press(`${mod}+Shift+H`);
    await page.waitForTimeout(700);
    await shot('history');
    await page.keyboard.press(`${mod}+Shift+H`); // toggle closed
    await page.waitForTimeout(300);
  },
};

await waitForReady();

for (const view of VIEWS) {
  const fn = CAPTURE[view];
  if (!fn) {
    console.warn(`  skip "${view}": no capture step defined`);
    continue;
  }
  try {
    await fn();
  } catch (e) {
    console.warn(`  skip "${view}":`, e.message);
  }
}

// Disconnect — do NOT close the page, that would kill the Electron renderer.
await browser.close();
console.log('\ndone.');
