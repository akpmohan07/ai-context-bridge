import { test, expect } from './fixtures';
import { DESTINATIONS, handoffTo } from './helpers';

// chatgpt.com serves a real, working chat to logged-out visitors, so this spec
// lets it actually load and verifies the real handoff round-trip:
// receiveHandoff() types the stashed context into the composer and sends it.
//
// Deliberately NOT asserting on the assistant's reply: that depends on
// chatgpt.com's live generation finishing, and its DOM shifts between streaming
// and final states — flakiness in chatgpt.com's behavior, not this extension's.
// What we own is getting the message onto the page and sent.
const TEST_PREFILL = 'ai-context-bridge e2e canary — please reply with any short answer.';

test('chatgpt.com: receiveHandoff types the stashed context and sends it, no login', async ({
  context,
}) => {
  const page = await context.newPage();
  await handoffTo(context, page, DESTINATIONS.chatgpt, TEST_PREFILL);

  await expect(page.locator('[data-user-message-copy]').getByText(TEST_PREFILL)).toBeVisible({
    timeout: 20_000,
  });
});

test('the floating AI Context Bridge button stays hidden off a /c/ conversation page', async ({
  context,
}) => {
  // The content script only activates FloatingButton on /c/... (a real,
  // logged-in conversation) — see entrypoints/chatgpt.content.js maybeInit().
  const page = await context.newPage();
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  // logged-out visitors get the "welcome mat" <textarea>, not #prompt-textarea
  await expect(page.locator('#prompt-textarea, #mobile-composer-prompt')).toBeVisible({
    timeout: 15_000,
  });
  expect(new URL(page.url()).pathname).not.toMatch(/^\/c\//);

  await page.waitForTimeout(2000); // let maybeInit()'s storage.get + MutationObserver settle
  await expect(page.locator('#ai-context-bridge')).toHaveCount(0);
});
