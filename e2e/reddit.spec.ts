import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures';
import { DESTINATIONS, assertDestinationHandoff } from './helpers';

// Discovers a real, currently-live thread instead of hardcoding a permalink —
// hardcoded threads eventually 404 or get removed, which would fail this spec
// for reasons unrelated to the extension. Reddit's public .json endpoint needs
// no auth.
//
// KNOWN ISSUE: as of this writing, both this endpoint and a plain subreddit
// listing page return a bot-detection wall ("blocked by network security") in
// this sandboxed environment — for anonymous/unauthenticated requests, before
// the extension is even involved. Not yet resolved; see conversation history.
async function findRedditThreadUrl(request: APIRequestContext): Promise<string> {
  const res = await request.get('https://www.reddit.com/r/AskReddit/hot.json?limit=25', {
    headers: { 'User-Agent': 'ai-context-bridge-e2e' },
  });
  const json = await res.json();
  const post = json.data.children.find((c: any) => !c.data.stickied && !c.data.over_18);
  if (!post) throw new Error('No suitable post found in r/AskReddit/hot.json');
  return `https://www.reddit.com${post.data.permalink}`;
}

test('injects the AI menu on a real Reddit thread and opens correct handoffs for every destination', async ({
  context,
}) => {
  test.skip(
    true,
    'reddit.com blocks anonymous automated requests (bot-detection wall) — see docs/tech-backlog.md § Playwright E2E'
  );

  const page = await context.newPage();
  const url = await findRedditThreadUrl(page.request);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const launcher = page.locator('.acb-reddit-launcher');
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
      "Here's a Reddit thread I'd like to discuss"
    );
  }
});
