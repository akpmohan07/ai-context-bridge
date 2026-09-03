import type { APIRequestContext, BrowserContext, Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DESTINATIONS, assertDestinationHandoff } from './helpers';

// Discovers a real, currently-live thread instead of hardcoding a permalink —
// hardcoded threads eventually 404 or get removed, which would fail this spec
// for reasons unrelated to the extension. Reddit's public .json endpoint needs
// no auth.
async function findRedditThreadUrl(request: APIRequestContext): Promise<string> {
  const res = await request.get('https://www.reddit.com/r/AskReddit/hot.json?limit=25', {
    headers: { 'User-Agent': 'ai-context-bridge-e2e' },
  });
  const json = await res.json();
  const post = json.data.children.find((c: any) => !c.data.stickied && !c.data.over_18);
  if (!post) throw new Error('No suitable post found in r/AskReddit/hot.json');
  return `https://www.reddit.com${post.data.permalink}`;
}

async function openRedditThread(
  context: BrowserContext
): Promise<{ page: Page; toggle: Locator }> {
  const page = await context.newPage();
  const url = await findRedditThreadUrl(page.request);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const launcher = page.locator('.acb-reddit-launcher');
  await expect(launcher).toBeVisible({ timeout: 15_000 });

  return { page, toggle: launcher.getByRole('button', { name: 'Open with AI' }) };
}

// KNOWN ISSUE: reddit.com's .json endpoint and even a plain subreddit listing
// page return a bot-detection wall ("blocked by network security") for
// anonymous/unauthenticated requests in this sandboxed dev environment —
// before the extension is even involved. Not yet resolved; see
// docs/tech-backlog.md § Playwright E2E.
test.describe.skip('Reddit → AI destinations (blocked: bot-detection wall)', () => {
  test('Reddit menu lists Claude, ChatGPT, Gemini and Copy for AI', async ({ context }) => {
    const { page, toggle } = await openRedditThread(context);
    await toggle.click();

    for (const dest of Object.values(DESTINATIONS)) {
      await expect(page.getByRole('menuitem', { name: dest.menuItemName })).toBeVisible();
    }
    await expect(page.getByRole('menuitem', { name: /Copy for AI/ })).toBeVisible();
  });

  test('Reddit → Claude opens a correct handoff', async ({ context }) => {
    const { page, toggle } = await openRedditThread(context);
    await toggle.click();
    await assertDestinationHandoff(
      context,
      page,
      DESTINATIONS.claude,
      "Here's a Reddit thread I'd like to discuss"
    );
  });

  test('Reddit → ChatGPT opens a correct handoff', async ({ context }) => {
    const { page, toggle } = await openRedditThread(context);
    await toggle.click();
    await assertDestinationHandoff(
      context,
      page,
      DESTINATIONS.chatgpt,
      "Here's a Reddit thread I'd like to discuss"
    );
  });

  test('Reddit → Gemini opens a correct handoff', async ({ context }) => {
    const { page, toggle } = await openRedditThread(context);
    await toggle.click();
    await assertDestinationHandoff(
      context,
      page,
      DESTINATIONS.gemini,
      "Here's a Reddit thread I'd like to discuss"
    );
  });
});
