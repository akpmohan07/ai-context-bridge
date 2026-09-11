import { createItem } from '../core/schema.js';

// Pure DOM parsers for a Reddit comments page. Reddit's `<thread>.json` endpoint
// is now OAuth-gated (403 anon, ~15s throttled otherwise), so we read the
// page's own `<shreddit-*>` web components instead — same data Reddit already
// rendered, no network, works logged-out. Only the comments Reddit has loaded
// (top ~25) are visible, which is fine: Budget.trim() keeps only the
// highest-scored within the word budget anyway.

const DEAD = new Set(['[deleted]', '[removed]', '']);

function textFrom(el, selectors) {
    for (const sel of selectors) {
        const node = el.querySelector(sel);
        if (node) return node.textContent.trim();
    }
    return '';
}

// <shreddit-post> → { title, body, community }
export function parsePost(postEl) {
    return {
        title: postEl.getAttribute('post-title') || '',
        body: textFrom(postEl, ['[slot="text-body"]', '[slot="post-media-container"] .md']),
        community:
            postEl.getAttribute('subreddit-prefixed-name') ||
            (postEl.getAttribute('subreddit-name') ? `r/${postEl.getAttribute('subreddit-name')}` : ''),
    };
}

// A flat, reading-order list of <shreddit-comment> (each carries a `depth`
// attribute) → a nested Item tree. A depth-indexed stack rebuilds the nesting:
// each comment attaches to the last comment one level shallower.
export function parseComments(commentEls) {
    const roots = [];
    const stack = []; // stack[d] = the Item currently open at depth d

    for (const el of commentEls) {
        const depth = Number(el.getAttribute('depth')) || 0;
        const text = textFrom(el, ['[slot="comment"]', '[id$="-comment-rtjson-content"]', '.md']);
        if (DEAD.has(text)) continue;

        const item = createItem({
            author: el.getAttribute('author') || '',
            score: Number(el.getAttribute('score')) || 0,
            text,
            depth,
            children: [],
        });

        // nearest still-open ancestor (a skipped [deleted] parent leaves a hole)
        let parent = null;
        for (let d = depth - 1; d >= 0; d--) {
            if (stack[d]) { parent = stack[d]; break; }
        }
        if (parent) parent.children.push(item);
        else roots.push(item);

        stack[depth] = item;
        stack.length = depth + 1; // drop any deeper, now-closed branches
    }

    return roots;
}
