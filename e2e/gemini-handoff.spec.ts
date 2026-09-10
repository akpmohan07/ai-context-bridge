import { test, expect } from './connected-fixtures';

// Gemini large-content handoff — the composer-insert path that replaces the
// ?prompt= URL param (which 400s past ~6k chars). Manual-local tier: needs a
// real signed-in Gemini session.
//
// PREREQUISITES (same as the other connected specs):
//   npm run e2e:login  →  sign into Google / Gemini by hand
//   npm run e2e:connect
//   then once: chrome://extensions → Load unpacked → .output/chrome-mv3
//
// This drives openWithContext() directly from the service worker (no Reddit/
// Medium page needed): it stashes a big payload and opens /app, then asserts
// gemini.content.js's injectUI() inserted it into the Quill composer and sent.

test('Gemini: a 10k-char payload is inserted into the composer and sent', async ({
  connectedContext,
}) => {
  test.setTimeout(60_000);

  const marker = `ACB-E2E-${Date.now()}`;
  const payload =
    `${marker}\n\n` + 'The quick brown fox jumps over the lazy dog. '.repeat(250); // ~11k chars
  expect(payload.length).toBeGreaterThan(6_000); // past the ?prompt= ceiling

  let [sw] = connectedContext.serviceWorkers();
  if (!sw) sw = await connectedContext.waitForEvent('serviceworker');

  // Stash + open exactly as GeminiPlatform.openWithContext does.
  await sw.evaluate(
    (p) => chrome.storage.local.set({ pendingGeminiPrompt: p }),
    payload
  );
  const page = await connectedContext.newPage();
  await page.bringToFront(); // execCommand('insertText') no-ops without doc focus
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });

  // injectUI polls the composer, inserts, then clicks send — so the payload
  // should land as a sent user turn (.query-text), not sit in the composer.
  page.on('console', (m) => {
    if (m.text().includes('[ACB]')) console.log('  page>', m.text());
  });
  const userTurn = page.locator('.query-text').filter({ hasText: marker });
  await expect(userTurn).toBeVisible({ timeout: 25_000 });

  // Consumed once — a later plain visit must not re-inject.
  const leftover = await sw.evaluate(() =>
    chrome.storage.local.get('pendingGeminiPrompt').then((r) => r.pendingGeminiPrompt)
  );
  expect(leftover).toBeUndefined();

  await page.close();
});
