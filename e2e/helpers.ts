import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

type Destination = {
  menuItemName: RegExp;
  hostPattern: string;
  urlPrefix: RegExp;
  // URL-param destinations carry the context in the query string; storage
  // destinations (Gemini) carry it in chrome.storage.local — its 400 on long
  // ?prompt= URLs is exactly why. Exactly one of these is set.
  param?: string;
  storageKey?: string;
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
    urlPrefix: /^https:\/\/gemini\.google\.com\/app$/,
    storageKey: 'pendingGeminiPrompt',
  },
} as const satisfies Record<string, Destination>;

// Arms a capture of the FIRST write to `key` (via chrome.storage.onChanged in
// the service worker) and returns a promise for that value. Must be called
// before the action that triggers the write — the popup's own content script
// (gemini.content.js → injectUI) consumes and clears the key on arrival, so a
// plain get() after the fact races and usually loses.
async function captureFirstWrite(context: BrowserContext, key: string): Promise<unknown> {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  return sw.evaluate(
    (k) =>
      new Promise((resolve) => {
        const done = (v: unknown) => {
          chrome.storage.onChanged.removeListener(listener);
          resolve(v);
        };
        const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
          if (area === 'local' && changes[k]?.newValue !== undefined) done(changes[k].newValue);
        };
        chrome.storage.onChanged.addListener(listener);
        setTimeout(() => done(undefined), 8000);
      }),
    key
  );
}

// Blocks the destination's own host so its page never actually loads (avoids
// depending on — and racing — a live third-party app's client-side behavior,
// see reddit.spec.ts/medium.spec.ts comments), then asserts the handoff our
// openWithContext() built: the popup URL, and either the query param or the
// stashed storage payload.
export async function assertDestinationHandoff(
  context: BrowserContext,
  page: Page,
  dest: Destination,
  expectedPromptSubstring: string
) {
  await context.route(dest.hostPattern, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '' })
  );

  // For storage dests, arm the capture BEFORE the click.
  const writePromise = dest.storageKey
    ? captureFirstWrite(context, dest.storageKey)
    : null;

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('menuitem', { name: dest.menuItemName }).click(),
  ]);
  await expect.poll(() => popup.url(), { timeout: 10_000 }).toMatch(dest.urlPrefix);

  if (dest.storageKey) {
    expect(popup.url()).not.toContain('prompt='); // context never rides the URL
    expect(String(await writePromise)).toContain(expectedPromptSubstring);
  } else {
    const value = new URL(popup.url()).searchParams.get(dest.param!) ?? '';
    expect(value).toContain(expectedPromptSubstring);
  }

  await popup.close();
  await context.unroute(dest.hostPattern);
}
