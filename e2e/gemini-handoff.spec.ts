import { test, expect } from './connected-fixtures';
import { DESTINATIONS, handoffTo, readExtensionStorage } from './helpers';

// Gemini large-content handoff — the composer-insert path that replaces the
// ?prompt= URL param (which 400s past ~6k chars). Manual-local tier: needs a
// real signed-in, onboarded Gemini session.
//
// PREREQUISITES (same as the other connected specs):
//   npm run e2e:login  →  sign into Google / Gemini by hand
//   npm run e2e:connect
//   then once: chrome://extensions → Load unpacked → .output/chrome-mv3
//
// Runs the real openWithContext flow (handoffTo), then asserts
// gemini.content.js → receiveHandoff() inserts it into the real Quill composer
// and sends it. Large Reddit/Medium payloads are covered by reddit.spec.ts.

test('Gemini: an 11k-char payload is inserted into the composer and sent', async ({
  connectedContext,
}) => {
  test.setTimeout(60_000);

  const marker = `ACB-E2E-${Date.now()}`;
  const payload =
    `${marker}\n\n` + 'The quick brown fox jumps over the lazy dog. '.repeat(250); // ~11k chars
  expect(payload.length).toBeGreaterThan(6_000); // past the ?prompt= ceiling

  const page = await connectedContext.newPage();
  page.on('console', (m) => {
    if (m.text().includes('[ACB]')) console.log('  page>', m.text());
  });
  const id = await handoffTo(connectedContext, page, DESTINATIONS.gemini, payload);

  // receiveHandoff polls the composer, inserts, then clicks send — the payload
  // should land as a sent user turn, not sit in the composer.
  await expect(page.locator('user-query').filter({ hasText: marker })).toBeVisible({
    timeout: 25_000,
  });

  // Consumed once — the handoff:<id> key is gone.
  expect(await readExtensionStorage(connectedContext, `handoff:${id}`)).toBeUndefined();

  await page.close();
});
