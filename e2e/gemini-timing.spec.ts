import { test, expect } from './connected-fixtures';
import { writeExtensionStorage } from './helpers';

// Gemini — Time Awareness on send. Mirrors claude-presence-and-timing.spec.ts
// (minus Presence, which is claude.ai-only), against a real signed-in Gemini
// session.
//
// PREREQUISITES (same as the other connected specs):
//   npm run e2e:login    → sign into Google / Gemini, click through Gemini's
//                          one-time "Chat with Gemini" onboarding
//   npm run e2e:connect
//   then, once: chrome://extensions → Load unpacked → .output/chrome-mv3
//
// Self-contained: step 3 backdates the stored last-message time rather than
// lowering THRESHOLD_MS + waiting a real gap. No source edit, nothing to revert.

const NEW_CHAT = 'https://gemini.google.com/app';
const THIRTY_ONE_MIN = 31 * 60 * 1000;

test('gemini.google.com real conversation: Time Awareness branches', async ({
  connectedContext,
  connectedPage,
}) => {
  test.setTimeout(150_000);

  // Match the <user-query> host and read its last instance — Gemini renders a
  // collapsed-bubble + expanded copy of .query-text per turn.
  const turns = connectedPage.locator('user-query');
  const lastTurn = () => turns.last();
  const input = connectedPage.locator('.ql-editor[contenteditable="true"]').first();
  const stopButton = connectedPage.locator(
    'button[aria-label="Stop response"], button[aria-label="Cancel"]'
  );

  async function send(text: string) {
    await input.click();
    await input.pressSequentially(text);
    await connectedPage.keyboard.press('Enter');
  }

  await test.step('message 1 (new chat): bare [TimeContext:] prefix, no elapsed', async () => {
    await connectedPage.bringToFront();
    await connectedPage.goto(NEW_CHAT, { waitUntil: 'domcontentloaded' });
    await expect(input).toBeVisible({ timeout: 15_000 });
    await send('What is 1 + 1?');

    await expect(turns).toHaveCount(1, { timeout: 10_000 });
    await expect(lastTurn()).toContainText('[TimeContext:');
    await expect(lastTurn()).not.toContainText('since last message');

    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  });

  await test.step('message 2 (immediately after): no prefix — active conversation', async () => {
    await send('What is 2 + 2?');
    await expect(turns).toHaveCount(2, { timeout: 10_000 });
    await expect(lastTurn()).toContainText('What is 2 + 2?');
    await expect(lastTurn()).not.toContainText('[TimeContext:');

    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  });

  await test.step('message 3 (after backdating the last-message time): prefix WITH elapsed', async () => {
    const convId = new URL(connectedPage.url()).pathname.match(/\/app\/([a-f0-9]+)/)?.[1];
    expect(convId, 'on a /app/<id> conversation after two sends').toBeTruthy();

    await writeExtensionStorage(connectedContext, {
      geminiLastMessageAt: { [convId!]: Date.now() - THIRTY_ONE_MIN },
    });
    await connectedPage.waitForTimeout(300); // let storage.onChanged reach the content script

    await send('What is 3 + 3?');
    await expect(turns).toHaveCount(3, { timeout: 10_000 });
    await expect(lastTurn()).toContainText('What is 3 + 3?');
    await expect(lastTurn()).toContainText('[TimeContext:');
    await expect(lastTurn()).toContainText('since last message');
  });
});
