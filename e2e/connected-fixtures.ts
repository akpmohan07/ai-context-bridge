import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';

// For specs that need a real authenticated session (Claude.ai, gated behind
// Cloudflare bot-management that checks navigator.webdriver live on every
// request — cookie replay alone doesn't work, see docs/tech-backlog.md
// § Claude.ai: guest doesn't work). Connects to a browser YOU launched
// manually (never Playwright), so navigator.webdriver was never set.
//
// Prerequisite, run yourself before this spec:
//   npm run e2e:login    (sign in by hand, once — or again if the session expired)
//   npm run e2e:connect  (relaunch same profile with the debug port on)
//
// This fixture only connects — it never launches, and never closes the real
// browser (closing would quit your actual Chrome window, not just disconnect).
const CDP_URL = 'http://127.0.0.1:9222';

export const test = base.extend<{
  connectedContext: BrowserContext;
  connectedPage: Page;
}>({
  // eslint-disable-next-line no-empty-pattern
  connectedContext: async ({}, use) => {
    let browser;
    try {
      browser = await chromium.connectOverCDP(CDP_URL);
    } catch (e) {
      throw new Error(
        `Could not connect to ${CDP_URL} — run "npm run e2e:login" then "npm run e2e:connect" first.`
      );
    }
    const context = browser.contexts()[0];
    await use(context);
    // Deliberately not closing — this is the user's real, manually-launched
    // Chrome, not something this fixture owns.
  },

  connectedPage: async ({ connectedContext }, use) => {
    const page = connectedContext.pages()[0] ?? (await connectedContext.newPage());
    await use(page);
  },
});

export const expect = test.expect;
