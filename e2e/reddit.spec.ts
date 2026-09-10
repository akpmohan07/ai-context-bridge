import type { BrowserContext, Locator, Page } from '@playwright/test';
import { test, expect } from './connected-fixtures';
import { DESTINATIONS, assertDestinationHandoff } from './helpers';

// Manual-local tier (connected-fixtures), like the Claude/Gemini specs. Reddit
// serves HTML pages fine to anonymous visitors but 403s its *.json API (now
// OAuth-only) — and from a datacenter IP (CI runners) even HTML can hit a bot
// wall. A real, human-launched browser on a residential IP loads it normally,
// no login needed.
//
// PREREQUISITES (same as the other connected specs):
//   npm run e2e:connect
//   then, once: chrome://extensions → Load unpacked → .output/chrome-mv3

// Discovers a currently-live thread by scraping the subreddit HTML page (the
// .json endpoint is blocked). new Reddit renders <shreddit-post permalink=…>;
// the <a href*="/comments/"> fallback covers an A/B'd layout.
async function findRedditThreadUrl(page: Page): Promise<string> {
  await page.goto('https://www.reddit.com/r/AskReddit/', { waitUntil: 'domcontentloaded' });

  const post = page.locator('shreddit-post[permalink]').first();
  if (await post.count()) {
    await post.waitFor({ timeout: 15_000 });
    const permalink = await post.getAttribute('permalink');
    if (permalink) return new URL(permalink, 'https://www.reddit.com').href;
  }

  const link = page.locator('a[href*="/r/AskReddit/comments/"]').first();
  await link.waitFor({ timeout: 15_000 });
  const href = await link.getAttribute('href');
  if (!href) throw new Error('no thread link found on /r/AskReddit/');
  return new URL(href, 'https://www.reddit.com').href;
}

async function openRedditThread(
  context: BrowserContext
): Promise<{ page: Page; toggle: Locator }> {
  const page = await context.newPage();
  try {
    await page.bringToFront();
    const url = await findRedditThreadUrl(page);
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const launcher = page.locator('.acb-reddit-launcher');
    await expect(launcher).toBeVisible({ timeout: 15_000 });

    return { page, toggle: launcher.getByRole('button', { name: 'Open with AI' }) };
  } catch (e) {
    await page.close(); // don't leave an orphan about:blank tab in the real browser
    throw e;
  }
}

test.describe('Reddit → AI destinations', () => {
  test('Reddit menu lists Claude, ChatGPT, Gemini and Copy for AI', async ({ connectedContext }) => {
    const { page, toggle } = await openRedditThread(connectedContext);
    await toggle.click();

    for (const dest of Object.values(DESTINATIONS)) {
      await expect(page.getByRole('menuitem', { name: dest.menuItemName })).toBeVisible();
    }
    await expect(page.getByRole('menuitem', { name: /Copy for AI/ })).toBeVisible();
    await page.close();
  });

  for (const [name, dest] of Object.entries(DESTINATIONS)) {
    test(`Reddit → ${name} opens a correct handoff`, async ({ connectedContext }) => {
      const { page, toggle } = await openRedditThread(connectedContext);
      await toggle.click();
      await assertDestinationHandoff(
        connectedContext,
        page,
        dest,
        "Here's a Reddit thread I'd like to discuss",
        // payload verification needs the extension SW / a popup page; skip it on
        // this cluttered connectOverCDP browser — medium.spec.ts covers it.
        { verifyPayload: false }
      );
      await page.close();
    });
  }
});
