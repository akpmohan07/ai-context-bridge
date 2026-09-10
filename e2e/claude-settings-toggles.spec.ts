import { test, expect } from './connected-fixtures';
import { DESTINATIONS, handoffTo, writeExtensionSyncStorage } from './helpers';

// Same prerequisites as claude-authenticated.spec.ts. Verifies the popup's
// timerEnabled toggle actually gates its feature, not just that the feature
// works under default settings (covered by the other claude specs).
//
// soundsEnabled is NOT checked here: what it gates (soundRegistry.play()) lazily
// creates a Web Audio AudioContext in the content script's *isolated* world,
// which a page-context probe (addInitScript) can't observe. That gate is a unit
// test instead — test/presence.test.js "PresenceLayer — soundsEnabled gate".

test('claude.ai: timerEnabled gates the TimeContext prefix', async ({
  connectedPage,
  connectedContext,
}) => {
  test.setTimeout(90_000); // 2 real sequential sends against the live site

  await test.step('timerEnabled: false → no TimeContext prefix', async () => {
    await writeExtensionSyncStorage(connectedContext, { timerEnabled: false });
    await handoffTo(connectedContext, connectedPage, DESTINATIONS.claude, 'What is 4 + 4?');
    const msg = connectedPage.locator('[data-testid="user-message"]').first();
    await expect(msg).toBeVisible({ timeout: 20_000 });
    await expect(msg).toContainText('What is 4 + 4?');
    await expect(msg).not.toContainText('[TimeContext:');
  });

  await test.step('timerEnabled: true (restored) → prefix resumes', async () => {
    await writeExtensionSyncStorage(connectedContext, { timerEnabled: true });
    await handoffTo(connectedContext, connectedPage, DESTINATIONS.claude, 'What is 5 + 5?');
    const msg = connectedPage.locator('[data-testid="user-message"]').first();
    await expect(msg).toBeVisible({ timeout: 20_000 });
    await expect(msg).toContainText('[TimeContext:');
  });
});
