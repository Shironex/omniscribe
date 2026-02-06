import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
});
