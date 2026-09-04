import { test, expect } from './connected-fixtures';

// Same prerequisites as claude-authenticated.spec.ts. Verifies the popup's
// two claude.ai-affecting toggles actually gate their features, not just
// that the features work under default settings (already covered by
// claude-authenticated.spec.ts and claude-presence-and-timing.spec.ts).
//
// timerEnabled: straightforward — check for the [TimeContext:] prefix.
// soundsEnabled: PresenceLayer._onTransition() logs unconditionally (used
// elsewhere to track state), so it can't prove the enable gate. What it
// actually gates is whether soundRegistry.play() ever runs — which lazily
// creates a Web Audio AudioContext on first use. Patching window.AudioContext
// via addInitScript (runs before the content script on each navigation) lets
// us detect whether one was ever created, without needing to hear anything.
//
// 4 real sends total (one new chat each, for a clean "first message" case).

async function setSyncStorage(sw: import('@playwright/test').Worker, values: Record<string, unknown>) {
  await sw.evaluate(
    (values) => new Promise<void>((resolve) => chrome.storage.sync.set(values, () => resolve())),
    values
  );
}

test('claude.ai settings toggles actually gate their features', async ({
  connectedPage,
  connectedContext,
}) => {
  test.setTimeout(120_000); // 4 real sequential sends against the live site — generous margin
  let sw = connectedContext.serviceWorkers()[0];
  if (!sw) sw = await connectedContext.waitForEvent('serviceworker');

  await test.step('timerEnabled: false → no TimeContext prefix', async () => {
    await setSyncStorage(sw, { timerEnabled: false });
    await connectedPage.goto(`https://claude.ai/new?q=${encodeURIComponent('What is 4 + 4?')}`, {
      waitUntil: 'domcontentloaded',
    });
    const msg = connectedPage.locator('[data-testid="user-message"]').first();
    await expect(msg).toBeVisible({ timeout: 15_000 });
    await expect(msg).toContainText('What is 4 + 4?');
    await expect(msg).not.toContainText('[TimeContext:');
  });

  await test.step('timerEnabled: true (restored) → prefix resumes', async () => {
    await setSyncStorage(sw, { timerEnabled: true });
    await connectedPage.goto(`https://claude.ai/new?q=${encodeURIComponent('What is 5 + 5?')}`, {
      waitUntil: 'domcontentloaded',
    });
    const msg = connectedPage.locator('[data-testid="user-message"]').first();
    await expect(msg).toBeVisible({ timeout: 15_000 });
    await expect(msg).toContainText('[TimeContext:');
  });

  await test.step('soundsEnabled: false → no AudioContext ever created', async () => {
    await setSyncStorage(sw, { soundsEnabled: false });
    await connectedPage.addInitScript(() => {
      (window as any).__audioContextCreated = false;
      const OrigAC = window.AudioContext;
      // @ts-expect-error monkey-patch for detection only
      window.AudioContext = class extends OrigAC {
        constructor(...args: any[]) {
          (window as any).__audioContextCreated = true;
          super(...(args as []));
        }
      };
    });
    await connectedPage.goto(`https://claude.ai/new?q=${encodeURIComponent('What is 6 + 6?')}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(connectedPage.locator('[data-testid="user-message"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await connectedPage.waitForTimeout(1_000); // let SENT's 'breath' sound attempt fire, if it's going to
    expect(await connectedPage.evaluate(() => (window as any).__audioContextCreated)).toBe(false);
  });

  await test.step('soundsEnabled: true → AudioContext gets created', async () => {
    await setSyncStorage(sw, { soundsEnabled: true });
    await connectedPage.addInitScript(() => {
      (window as any).__audioContextCreated = false;
      const OrigAC = window.AudioContext;
      // @ts-expect-error monkey-patch for detection only
      window.AudioContext = class extends OrigAC {
        constructor(...args: any[]) {
          (window as any).__audioContextCreated = true;
          super(...(args as []));
        }
      };
    });
    await connectedPage.goto(`https://claude.ai/new?q=${encodeURIComponent('What is 7 + 7?')}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(connectedPage.locator('[data-testid="user-message"]').first()).toBeVisible({
      timeout: 15_000,
    });
    await connectedPage.waitForTimeout(1_000);
    expect(await connectedPage.evaluate(() => (window as any).__audioContextCreated)).toBe(true);

    // Restore the real default (false) so the dummy account's extension
    // state doesn't stay modified for whoever uses this profile next.
    await setSyncStorage(sw, { soundsEnabled: false });
  });
});
