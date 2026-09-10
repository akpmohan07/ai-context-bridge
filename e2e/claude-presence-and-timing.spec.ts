import { test, expect } from './connected-fixtures';
import { writeExtensionStorage } from './helpers';

// Same prerequisites as claude-authenticated.spec.ts — see that file's header
// comment (npm run e2e:login → e2e:connect → Load unpacked once via the UI).
// Self-contained: step 3 backdates the stored last-message time, so no source
// edit / THRESHOLD_MS lowering is needed.
//
// Combines the remaining Time Awareness branches (active-conversation /
// after-a-gap) and the Presence state machine into ONE continuous real
// conversation — deliberately not one spec per feature, to avoid multiplying
// real sends on the dummy account. 3 real sends total in this file.
//
// Presence's actual sound playback can't be verified here — Playwright has no
// way to check audio output. PresenceLayer._onTransition() logs
// `[ACB] Presence: state: <STATE>` unconditionally, before the sounds-enabled
// gate, so what's verified is the state machine itself firing correctly off
// real DOM events (a real send, the real "Stop response" button appearing
// then disappearing) — that's the part actually owned by this extension's
// code; whether a sound plays after that is a one-line `if (this._enabled)`
// already covered by unit tests.

test('claude.ai real conversation: Time Awareness branches + Presence state machine', async ({
  connectedContext,
  connectedPage,
}) => {
  test.setTimeout(150_000); // waits for two real Claude replies

  const presenceStates: string[] = [];
  connectedPage.on('console', (msg) => {
    const m = msg.text().match(/\[ACB\] Presence: state: (\w+)/);
    if (m) presenceStates.push(m[1]);
  });

  const stopButton = connectedPage.locator('button[aria-label="Stop response"]');

  await test.step('message 1 (new chat): bare TimeContext prefix + Presence SENT→GENERATING→REPLIED', async () => {
    await connectedPage.goto(`https://claude.ai/new?q=${encodeURIComponent('What is 1 + 1?')}`, {
      waitUntil: 'domcontentloaded',
    });

    const firstMessage = connectedPage.locator('[data-testid="user-message"]').first();
    await expect(firstMessage).toBeVisible({ timeout: 15_000 });
    await expect(firstMessage).toContainText('[TimeContext:');
    await expect(firstMessage).not.toContainText('since last message');

    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    await expect(stopButton).toBeHidden({ timeout: 60_000 });
    // StopButtonTrigger polls every 150ms — give it a moment to catch up and
    // log the REPLIED transition after the DOM change it's watching for.
    await connectedPage.waitForTimeout(500);

    expect(presenceStates).toEqual(['SENT', 'GENERATING', 'REPLIED']);
  });

  await test.step('message 2 (same chat, immediately after): no TimeContext prefix — active conversation', async () => {
    const input = connectedPage.locator('div[contenteditable="true"]').first();
    await input.click();
    await input.type('What is 2 + 2?');
    await connectedPage.keyboard.press('Enter');

    const messages = connectedPage.locator('[data-testid="user-message"]');
    await expect(messages).toHaveCount(2, { timeout: 10_000 });
    const secondMessage = messages.nth(1);
    await expect(secondMessage).toContainText('What is 2 + 2?');
    await expect(secondMessage).not.toContainText('[TimeContext:');

    await expect(stopButton).toBeVisible({ timeout: 20_000 });
    await expect(stopButton).toBeHidden({ timeout: 60_000 });
  });

  await test.step('message 3 (same chat, after backdating the last-message time): TimeContext prefix WITH elapsed duration', async () => {
    const convId = new URL(connectedPage.url()).pathname.match(/\/chat\/([^/?]+)/)?.[1];
    expect(convId, 'on a /chat/<uuid> conversation after two sends').toBeTruthy();
    await writeExtensionStorage(connectedContext, {
      claudeLastMessageAt: { [convId!]: Date.now() - 31 * 60 * 1000 },
    });
    await connectedPage.waitForTimeout(300); // let storage.onChanged reach the content script

    const input = connectedPage.locator('div[contenteditable="true"]').first();
    await input.click();
    await input.type('What is 3 + 3?');
    await connectedPage.keyboard.press('Enter');

    const messages = connectedPage.locator('[data-testid="user-message"]');
    await expect(messages).toHaveCount(3, { timeout: 10_000 });
    const thirdMessage = messages.nth(2);
    await expect(thirdMessage).toContainText('What is 3 + 3?');
    await expect(thirdMessage).toContainText('[TimeContext:');
    await expect(thirdMessage).toContainText('since last message');
  });
});
