import type { BrowserContext, Page } from '@playwright/test';
import { expect } from './fixtures';

type Destination = {
  menuItemName: RegExp;
  hostPattern: string;
  urlPrefix: RegExp;
  newChatUrl: string;
};

// The context rides chrome.storage.local under `handoff:<uuid>`, with the uuid
// in the opened tab's #fragment — see AIPlatform in src/ai-platforms/base.js.
const HANDOFF_PREFIX = 'handoff:';

// Mirrors src/ai-platforms/registry.js — one entry per live destination the
// dropdown offers, keyed so a spec can assert a single named destination
// (e.g. DESTINATIONS.claude) instead of an opaque loop index. Each opens a bare
// new-chat URL and the content is picked up from storage on arrival — see
// AIPlatform in src/ai-platforms/base.js. `urlPrefix` tolerates a trailing
// conversation id if the route mock misses and the real content script sends.
export const DESTINATIONS = {
  claude: {
    menuItemName: /Open in Claude/,
    hostPattern: 'https://claude.ai/**',
    newChatUrl: 'https://claude.ai/new',
    urlPrefix: /^https:\/\/claude\.ai\/new(\?model=[^#]+)?(#acb=[\w-]+)?$/,
  },
  chatgpt: {
    menuItemName: /Open in ChatGPT/,
    hostPattern: 'https://chatgpt.com/**',
    newChatUrl: 'https://chatgpt.com/',
    urlPrefix: /^https:\/\/chatgpt\.com\/(c\/[^/#]+)?(#acb=[\w-]+)?$/,
  },
  gemini: {
    menuItemName: /Open in Gemini/,
    hostPattern: 'https://gemini.google.com/**',
    newChatUrl: 'https://gemini.google.com/app',
    urlPrefix: /^https:\/\/gemini\.google\.com\/app(\/[a-f0-9]+)?(#acb=[\w-]+)?$/,
  },
} as const satisfies Record<string, Destination>;

// The real openWithContext flow, minus the source page: stash a handoff under a
// fresh id and navigate the tab to the new-chat URL with that id in the
// fragment. receiveHandoff picks it up.
export async function handoffTo(
  context: BrowserContext,
  page: Page,
  dest: Destination,
  text: string
): Promise<string> {
  const id = crypto.randomUUID();
  await writeExtensionStorage(context, { [HANDOFF_PREFIX + id]: { text, ts: Date.now() } });
  await page.bringToFront(); // execCommand / the "use caution" banner need focus
  await page.goto(`${dest.newChatUrl}#acb=${id}`, { waitUntil: 'domcontentloaded' });
  return id;
}

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

// Blocks the destination's own host so its page never actually loads (avoids
// depending on — and racing — a live third-party app), then asserts what
// openWithContext() built: the menu item opens a NEW page at the bare new-chat
// URL with a `#acb=<uuid>` fragment and nothing in the query string. That the
// storage key `handoff:<uuid>` holds the right text is unit-tested
// (test/platforms.test.js) and proven end-to-end by gemini-handoff.spec.ts.
export async function assertDestinationHandoff(context: BrowserContext, page: Page, dest: Destination) {
  await context.route(dest.hostPattern, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '' })
  );
  try {
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('menuitem', { name: dest.menuItemName }).click(),
    ]);
    await expect.poll(() => popup.url(), { timeout: 10_000 }).toMatch(dest.urlPrefix);
    expect(popup.url()).toMatch(/#acb=[\w-]+$/); // context id in the fragment…
    expect(new URL(popup.url()).search).not.toMatch(/[?&](q|prompt)=/); // …never the query
    await popup.close();
  } finally {
    await context.unroute(dest.hostPattern);
  }
}
