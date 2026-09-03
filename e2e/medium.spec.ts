import type { APIRequestContext } from '@playwright/test';
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

test('injects the AI menu on a real Medium article and opens correct handoffs for every destination', async ({
  context,
}) => {
  const page = await context.newPage();
  const url = await findMediumArticleUrl(page.request);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const launcher = page.locator('.acb-medium-launcher');
  await expect(launcher).toBeVisible({ timeout: 15_000 });

  const toggle = launcher.getByRole('button', { name: 'Open with AI' });
  await toggle.click();
  for (const dest of DESTINATIONS) {
    await expect(page.getByRole('menuitem', { name: dest.menuItemName })).toBeVisible();
  }
  await expect(page.getByRole('menuitem', { name: /Copy for AI/ })).toBeVisible();
  await toggle.click(); // close — each loop iteration below opens fresh

  for (const dest of DESTINATIONS) {
    await toggle.click();
    await assertDestinationHandoff(
      context,
      page,
      dest,
      "Here's a Medium article I'd like to discuss"
    );
  }
});
