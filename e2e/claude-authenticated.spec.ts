import { test, expect } from './connected-fixtures';
import { DESTINATIONS, handoffTo } from './helpers';

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

test('claude.ai real handoff: receiveHandoff types + sends, Time Awareness prefixes it', async ({
  connectedContext,
  connectedPage,
}) => {
  const testMsg = 'What is 1 + 1?';
  await handoffTo(connectedContext, connectedPage, DESTINATIONS.claude, testMsg);

  const sentMessage = connectedPage.locator('[data-testid="user-message"]').first();
  await expect(sentMessage).toBeVisible({ timeout: 20_000 });
  await expect(sentMessage).toContainText(testMsg);

  // First message in a brand-new chat always gets a bare [TimeContext: ...]
  // prefix (no "since last message" — nothing to compare against yet). See
  // src/time/time-logic.js buildPrefix(). This also confirms
  // _fillComposerAndSend's sendButton.click() dispatches a real click event —
  // MessageTimer's document-level capture listener only fires on real clicks,
  // so the prefix wouldn't appear at all otherwise.
  await expect(sentMessage).toContainText('[TimeContext:');
});
