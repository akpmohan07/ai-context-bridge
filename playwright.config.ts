import { defineConfig } from '@playwright/test';

// Chrome extensions require a persistent context (see e2e/fixtures.ts) and,
// per Playwright's own docs, only work in headed Chromium — so CI runs this
// under xvfb. testDir points at e2e/; L1 unit tests (vitest) are separate.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // 'list' for live console output; 'html' produces the readable pass/fail +
  // timing + trace report uploaded as a CI artifact; 'json' feeds
  // e2e/write-summary.mjs, which renders the GitHub Actions run summary
  // (see .github/workflows/ci.yml).
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
});
