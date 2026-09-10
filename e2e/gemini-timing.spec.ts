import { test, expect } from './connected-fixtures';

// Gemini — Time Awareness on send. Mirrors claude-presence-and-timing.spec.ts
// (minus Presence, which is claude.ai-only), against a real signed-in Gemini
// session.
//
// PREREQUISITES (same as the Claude authenticated specs):
//   npm run e2e:login    → sign into Google / Gemini by hand, click through
//                          Gemini's one-time "Chat with Gemini" onboarding
//   npm run e2e:connect  → relaunch with the debug port
//   then, once: chrome://extensions → Load unpacked → .output/chrome-mv3
//
// Self-contained: rather than lowering THRESHOLD_MS + waiting a real gap, step 3
// backdates the stored last-message time via the service worker. No source edit,
// nothing to revert.
//
// Gemini is RECORD-ONLY (no history seed — see docs/platforms/gemini/
// time-context.md), so this starts from a brand-new chat: the one path that
// doesn't depend on a prior stored timestamp.

const NEW_CHAT = 'https://gemini.google.com/app';
const THIRTY_ONE_MIN = 31 * 60 * 1000;

test('gemini.google.com real conversation: Time Awareness branches', async ({
  connectedContext,
  connectedPage,
}) => {
  test.setTimeout(150_000);

  // Visible prompt text is .query-text; the <user-query> host also carries a
  // "You said …" a11y label and a collapsed-bubble copy, so match narrowly.
  const userTurns = connectedPage.locator('.query-text');
  const input = connectedPage.locator('.ql-editor[contenteditable="true"]').first();
  const stopButton = connectedPage.locator(
    'button[aria-label="Stop response"], button[aria-label="Cancel"]'
  );

  async function send(text: string) {
    await input.click();
    await input.pressSequentially(text);
    await connectedPage.keyboard.press('Enter');
  }

  let [sw] = connectedContext.serviceWorkers();
  if (!sw) sw = await connectedContext.waitForEvent('serviceworker');

  await test.step('message 1 (new chat): bare [TimeContext:] prefix, no elapsed', async () => {
    await connectedPage.bringToFront();
    await connectedPage.goto(NEW_CHAT, { waitUntil: 'domcontentloaded' });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await send('What is 1 + 1?');

    await expect(userTurns).toHaveCount(1, { timeout: 10_000 });
    await expect(userTurns.first()).toContainText('[TimeContext:');
    await expect(userTurns.first()).not.toContainText('since last message');

    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  });

  await test.step('message 2 (immediately after): no prefix — active conversation', async () => {
    await send('What is 2 + 2?');
    await expect(userTurns).toHaveCount(2, { timeout: 10_000 });
    await expect(userTurns.nth(1)).toContainText('What is 2 + 2?');
    await expect(userTurns.nth(1)).not.toContainText('[TimeContext:');

    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  });

  await test.step('message 3 (after backdating the last-message time): prefix WITH elapsed', async () => {
    const convId = new URL(connectedPage.url()).pathname.match(/\/app\/([a-f0-9]+)/)?.[1];
    expect(convId, 'on a /app/<id> conversation after two sends').toBeTruthy();

    await sw.evaluate(
      async ({ id, backMs }) => {
        const { geminiLastMessageAt = {} } = await chrome.storage.local.get('geminiLastMessageAt');
        geminiLastMessageAt[id] = Date.now() - backMs;
        await chrome.storage.local.set({ geminiLastMessageAt });
      },
      { id: convId, backMs: THIRTY_ONE_MIN }
    );
    await connectedPage.waitForTimeout(300); // let storage.onChanged reach the content script

    await send('What is 3 + 3?');
    await expect(userTurns).toHaveCount(3, { timeout: 10_000 });
    await expect(userTurns.nth(2)).toContainText('What is 3 + 3?');
    await expect(userTurns.nth(2)).toContainText('[TimeContext:');
    await expect(userTurns.nth(2)).toContainText('since last message');
  });
});
