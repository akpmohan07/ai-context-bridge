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
    // /app, or /app/<id> if the route mock misses and the real content script
    // sends + navigates (can happen on a connectOverCDP context).
    urlPrefix: /^https:\/\/gemini\.google\.com\/app(\/|$)/,
    storageKey: 'pendingGeminiPrompt',
  },
} as const satisfies Record<string, Destination>;

// A context in which chrome.* APIs are available for evaluate(). Prefers this
// extension's background service worker (the only one in a launchPersistentContext);
// on a connectOverCDP browser the MV3 worker idles out and isn't listed, so it
// falls back to a transient popup page (chrome-extension://<id>/popup.html),
// discovering the id from chrome://extensions.
type ExtEval = { evaluate: <T>(fn: any, arg?: any) => Promise<T>; dispose: () => Promise<void> };

async function extensionEval(context: BrowserContext): Promise<ExtEval> {
  for (const w of context.serviceWorkers()) {
    if (!w.url().startsWith('chrome-extension://')) continue;
    const name = await w.evaluate(() => chrome?.runtime?.getManifest?.().name).catch(() => null);
    if (name === 'AI Context Bridge') {
      return { evaluate: (fn, arg) => w.evaluate(fn, arg), dispose: async () => {} };
    }
  }

  const probe = await context.newPage();
  let id: string | null;
  try {
    await probe.goto('chrome://extensions/');
    id = await probe.evaluate(() => {
      const mgr = document.querySelector('extensions-manager') as any;
      for (const list of mgr?.shadowRoot?.querySelectorAll('extensions-item-list') ?? []) {
        for (const item of list.shadowRoot.querySelectorAll('extensions-item')) {
          const name = item.shadowRoot.querySelector('#name')?.textContent?.trim();
          if (name && /AI Context Bridge/i.test(name)) return item.getAttribute('id');
        }
      }
      return null;
    });
  } finally {
    await probe.close();
  }
  if (!id) throw new Error('AI Context Bridge not found on chrome://extensions — is it loaded?');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  return { evaluate: (fn, arg) => popup.evaluate(fn, arg), dispose: () => popup.close() };
}

// Reads/writes this extension's chrome.storage.local from a spec.
export async function writeExtensionStorage(context: BrowserContext, obj: Record<string, unknown>) {
  const ext = await extensionEval(context);
  try {
    await ext.evaluate((o: any) => chrome.storage.local.set(o), obj);
  } finally {
    await ext.dispose();
  }
}

export async function readExtensionStorage(context: BrowserContext, key: string): Promise<unknown> {
  const ext = await extensionEval(context);
  try {
    return await ext.evaluate((k: string) => chrome.storage.local.get(k).then((r) => r[k]), key);
  } finally {
    await ext.dispose();
  }
}

// chrome.storage.sync — the popup's feature toggles live here.
export async function writeExtensionSyncStorage(context: BrowserContext, obj: Record<string, unknown>) {
  const ext = await extensionEval(context);
  try {
    await ext.evaluate((o: any) => chrome.storage.sync.set(o), obj);
  } finally {
    await ext.dispose();
  }
}

// Arms a capture of the FIRST write to `key` (via chrome.storage.onChanged) and
// returns a promise for that value. Must be called before the action that
// triggers the write — the popup's own content script (gemini.content.js →
// injectUI) consumes and clears the key on arrival, so a plain get() after the
// fact races and usually loses.
async function captureFirstWrite(context: BrowserContext, key: string): Promise<unknown> {
  const ext = await extensionEval(context);
  try {
    return await ext.evaluate(
      (k: string) =>
        new Promise((resolve) => {
          const done = (v: unknown) => {
            chrome.storage.onChanged.removeListener(listener);
            resolve(v);
          };
          const listener = (changes: any, area: string) => {
            if (area === 'local' && changes[k]?.newValue !== undefined) done(changes[k].newValue);
          };
          chrome.storage.onChanged.addListener(listener);
          setTimeout(() => done(undefined), 8000);
        }),
      key
    );
  } finally {
    await ext.dispose();
  }
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
  expectedPromptSubstring: string,
  // Reading a storage-dest's payload needs the extension's MV3 service worker
  // awake and enumerable — reliable in a launchPersistentContext, flaky on a
  // connectOverCDP browser full of other extensions. Off there; the payload is
  // still covered by unit tests + medium.spec.ts + gemini-handoff.spec.ts.
  { verifyPayload = true }: { verifyPayload?: boolean } = {}
) {
  await context.route(dest.hostPattern, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '' })
  );

  // For storage dests, arm the capture BEFORE the click.
  const writePromise =
    dest.storageKey && verifyPayload ? captureFirstWrite(context, dest.storageKey) : null;

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('menuitem', { name: dest.menuItemName }).click(),
  ]);
  await expect.poll(() => popup.url(), { timeout: 10_000 }).toMatch(dest.urlPrefix);

  if (dest.storageKey) {
    expect(popup.url()).not.toContain('prompt='); // context never rides the URL
    if (writePromise) expect(String(await writePromise)).toContain(expectedPromptSubstring);
  } else {
    const value = new URL(popup.url()).searchParams.get(dest.param!) ?? '';
    expect(value).toContain(expectedPromptSubstring);
  }

  await popup.close();
  await context.unroute(dest.hostPattern);
}
