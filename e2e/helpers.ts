import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

type Destination = {
  menuItemName: RegExp;
  hostPattern: string;
  urlPrefix: RegExp;
  param: string;
};

// Mirrors src/ai-platforms/registry.js — one entry per live destination the
// dropdown offers, keyed so a spec can assert a single named destination
// (e.g. DESTINATIONS.claude) instead of an opaque loop index.
export const DESTINATIONS = {
  claude: {
    menuItemName: /Open in Claude/,
    hostPattern: 'https://claude.ai/**',
    urlPrefix: /^https:\/\/claude\.ai\/new\?q=/,
    param: 'q',
  },
  chatgpt: {
    menuItemName: /Open in ChatGPT/,
    hostPattern: 'https://chatgpt.com/**',
    urlPrefix: /^https:\/\/chatgpt\.com\/\?q=/,
    param: 'q',
  },
  gemini: {
    menuItemName: /Open in Gemini/,
    hostPattern: 'https://gemini.google.com/**',
    urlPrefix: /^https:\/\/gemini\.google\.com\/app\?prompt=/,
    param: 'prompt',
  },
} as const satisfies Record<string, Destination>;

// Blocks the destination's own host so its page never actually loads (avoids
// depending on — and racing — a live third-party app's client-side behavior,
// see reddit.spec.ts/medium.spec.ts comments), then asserts the popup's URL
// is exactly what our openWithContext() built.
export async function assertDestinationHandoff(
  context: BrowserContext,
  page: Page,
  dest: Destination,
  expectedPromptSubstring: string
) {
  await context.route(dest.hostPattern, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '' })
  );
  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('menuitem', { name: dest.menuItemName }).click(),
  ]);
  await expect.poll(() => popup.url(), { timeout: 10_000 }).toMatch(dest.urlPrefix);

  const value = new URL(popup.url()).searchParams.get(dest.param) ?? '';
  expect(value).toContain(expectedPromptSubstring);

  await popup.close();
  await context.unroute(dest.hostPattern);
}
