import type { APIRequestContext, BrowserContext, Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { DESTINATIONS, assertDestinationHandoff } from './helpers';

// Discovers a live article via Medium's public tag RSS feed rather than
// hardcoding a URL that will eventually 404 or get paywalled. The <channel>
// carries its own <link> (and a duplicate inside <image>) before any <item>,
// so scope the match to the first <item> block rather than picking by
// position.
async function findMediumArticleUrl(request: APIRequestContext): Promise<string> {
  const res = await request.get('https://medium.com/feed/tag/javascript');
  const xml = await res.text();
  const firstItem = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1];
  const articleUrl = firstItem?.match(/<link>(https:\/\/medium\.com\/[^<]+)<\/link>/)?.[1];
  if (!articleUrl) throw new Error('No article link found in medium.com/feed/tag/javascript');
  return articleUrl;
}

// Navigates to a live article, confirms the launcher injected, and returns
// the page + the "Open with AI" toggle — each test opens the dropdown itself
// right before it needs it, since a stale-open dropdown from a prior click
// would make the next click close instead of open it.
async function openMediumArticle(
  context: BrowserContext
): Promise<{ page: Page; toggle: Locator }> {
  const page = await context.newPage();
  const url = await findMediumArticleUrl(page.request);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const launcher = page.locator('.acb-medium-launcher');
  await expect(launcher).toBeVisible({ timeout: 15_000 });

  return { page, toggle: launcher.getByRole('button', { name: 'Open with AI' }) };
}

test('Medium menu lists Claude, ChatGPT, Gemini and Copy for AI', async ({ context }) => {
  const { page, toggle } = await openMediumArticle(context);
  await toggle.click();

  for (const dest of Object.values(DESTINATIONS)) {
    await expect(page.getByRole('menuitem', { name: dest.menuItemName })).toBeVisible();
  }
  await expect(page.getByRole('menuitem', { name: /Copy for AI/ })).toBeVisible();
});

test('Medium → Claude opens a correct handoff', async ({ context }) => {
  const { page, toggle } = await openMediumArticle(context);
  await toggle.click();
  await assertDestinationHandoff(
    context,
    page,
    DESTINATIONS.claude,
    "Here's a Medium article I'd like to discuss"
  );
});

test('Medium → ChatGPT opens a correct handoff', async ({ context }) => {
  const { page, toggle } = await openMediumArticle(context);
  await toggle.click();
  await assertDestinationHandoff(
    context,
    page,
    DESTINATIONS.chatgpt,
    "Here's a Medium article I'd like to discuss"
  );
});

test('Medium → Gemini opens a correct handoff', async ({ context }) => {
  const { page, toggle } = await openMediumArticle(context);
  await toggle.click();
  await assertDestinationHandoff(
    context,
    page,
    DESTINATIONS.gemini,
    "Here's a Medium article I'd like to discuss"
  );
});
