import { test, expect } from './connected-fixtures';
import { writeExtensionStorage, readExtensionStorage } from './helpers';

// Gemini large-content handoff — the composer-insert path that replaces the
// ?prompt= URL param (which 400s past ~6k chars). Manual-local tier: needs a
// real signed-in, onboarded Gemini session.
//
// PREREQUISITES (same as the other connected specs):
//   npm run e2e:login  →  sign into Google / Gemini by hand
//   npm run e2e:connect
//   then once: chrome://extensions → Load unpacked → .output/chrome-mv3
//
// Simulates openWithContext()'s stash (large payloads through Reddit/Medium are
// covered by reddit.spec.ts), then asserts gemini.content.js → injectUI()
// inserts it into the real Quill composer and sends it.

test('Gemini: an 11k-char payload is inserted into the composer and sent', async ({
  connectedContext,
}) => {
  test.setTimeout(60_000);

  const marker = `ACB-E2E-${Date.now()}`;
  const payload =
    `${marker}\n\n` + 'The quick brown fox jumps over the lazy dog. '.repeat(250); // ~11k chars
  expect(payload.length).toBeGreaterThan(6_000); // past the ?prompt= ceiling

  await writeExtensionStorage(connectedContext, {
    pendingGeminiPrompt: { text: payload, ts: Date.now() },
  });

  const page = await connectedContext.newPage();
  page.on('console', (m) => {
    if (m.text().includes('[ACB]')) console.log('  page>', m.text());
  });
  await page.bringToFront(); // execCommand('insertText') no-ops without doc focus
  await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded' });

  // injectUI polls the composer, inserts, then clicks send — the payload should
  // land as a sent user turn, not sit in the composer.
  await expect(page.locator('user-query').filter({ hasText: marker })).toBeVisible({
    timeout: 25_000,
  });

  // Consumed once — a later plain visit must not re-inject.
  expect(await readExtensionStorage(connectedContext, 'pendingGeminiPrompt')).toBeUndefined();

  await page.close();
});
