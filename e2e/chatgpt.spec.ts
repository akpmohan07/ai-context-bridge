import { test, expect } from './fixtures';

// Unlike claude.ai and (presumably) gemini.google.com, chatgpt.com serves a
// real, working chat to logged-out visitors — confirmed manually: a ?q=
// prefill auto-sends, no storageState/login needed. So unlike medium.spec.ts's
// Claude/ChatGPT/Gemini checks (which block the destination's own host and
// only assert our URL construction), this spec lets chatgpt.com actually load
// and verifies the real prefill+send round-trip.
//
// Deliberately NOT asserting on the assistant's reply appearing: that depends
// on chatgpt.com's live generation finishing, and its DOM shifts between a
// streaming and a final state with different classes — chasing that timing is
// flakiness in chatgpt.com's own behavior, not anything this extension is
// responsible for. What we own is getting the message onto the page and sent.
const TEST_PREFILL = 'ai-context-bridge e2e canary — please reply with any short answer.';

test('chatgpt.com auto-sends a ?q= prefill, no login required', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(`https://chatgpt.com/?q=${encodeURIComponent(TEST_PREFILL)}`, {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.locator('[data-user-message-copy]').getByText(TEST_PREFILL)).toBeVisible({
    timeout: 15_000,
  });
});

test('the floating AI Context Bridge button stays hidden on a guest chat page', async ({
  context,
}) => {
  // The content script only activates FloatingButton on /c/... (a real,
  // logged-in conversation) — see entrypoints/chatgpt.content.js maybeInit().
  // Guest chats never land on /c/... (observed both /uc/<id> and staying on
  // /?model=auto — chatgpt.com's own redirect timing/shape isn't consistent
  // run to run), so assert the one thing that actually matters: wherever it
  // lands, it isn't /c/...
  const page = await context.newPage();
  await page.goto(`https://chatgpt.com/?q=${encodeURIComponent('hi')}`, {
    waitUntil: 'domcontentloaded',
  });
  // ChatGPT can render a second, transient "Write-only optimistic message"
  // element with the same attribute — scope by text like the first test does.
  await expect(page.locator('[data-user-message-copy]').getByText('hi')).toBeVisible({
    timeout: 15_000,
  });
  expect(new URL(page.url()).pathname).not.toMatch(/^\/c\//);

  await page.waitForTimeout(2000); // let maybeInit()'s storage.get + MutationObserver settle
  await expect(page.locator('#ai-context-bridge')).toHaveCount(0);
});
