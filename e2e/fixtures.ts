import { test as base, chromium, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// process.cwd() is the repo root — playwright is always invoked from there (see package.json's test:e2e).
const EXTENSION_PATH = path.join(process.cwd(), '.output', 'chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    if (!fs.existsSync(EXTENSION_PATH)) {
      throw new Error(
        `Extension build not found at ${EXTENSION_PATH} — run "npm run build" first.`
      );
    }
    const context = await chromium.launchPersistentContext('', {
      // Chrome extensions don't load in classic headless mode (confirmed locally:
      // the context launches but never gets a serviceworker event and closes).
      // CI runs this under xvfb — see .github/workflows/e2e.yml.
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent('serviceworker');
    }
    const extensionId = serviceWorker.url().split('/')[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
