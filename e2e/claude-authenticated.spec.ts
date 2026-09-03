import { test, expect } from './connected-fixtures';

// Requires a real authenticated session — see docs/tech-backlog.md §
// Claude.ai: guest doesn't work, real auth still required, for why this can't
// be a launch()'d/mocked browser. Run yourself before this spec:
//   npm run e2e:login    (sign in by hand, once — or again if the session expired)
//   npm run e2e:connect  (relaunch same profile with the debug port on)
//   then, once: chrome://extensions → Developer mode → Load unpacked →
//   .output/chrome-mv3 (a one-time manual step — --load-extension on the
//   command line is itself blocked on this Google-identity-linked profile,
//   even though the identical unpacked build loads fine via the UI button)
//
// This sends a REAL message to a REAL claude.ai conversation every time it
// runs. The message is a fixed, ordinary-looking human question (not a
// randomized/timestamped "canary" string) — an account sending a stream of
// obviously bot-shaped messages is a reasonable thing for abuse detection to
// flag; a normal, repeatable question isn't.

test('claude.ai real auto-send: ?q= prefill sends, and Time Awareness prefixes the first message', async ({
  connectedPage,
}) => {
  const testMsg = 'What is 1 + 1?';
  await connectedPage.goto(`https://claude.ai/new?q=${encodeURIComponent(testMsg)}`, {
    waitUntil: 'domcontentloaded',
  });

  const sentMessage = connectedPage.locator('[data-testid="user-message"]').first();
  await expect(sentMessage).toBeVisible({ timeout: 15_000 });
  await expect(sentMessage).toContainText(testMsg);

  // First message in a brand-new chat always gets a bare [TimeContext: ...]
  // prefix (no "since last message" — there's nothing to compare against yet).
  // See src/time/time-logic.js buildPrefix(). This also confirms injectUI()'s
  // programmatic sendButton.click() genuinely dispatches a real click event —
  // MessageTimer's document-level capture listener only fires on real DOM
  // click events, so this wouldn't fire at all if it didn't.
  await expect(sentMessage).toContainText('[TimeContext:');
});
