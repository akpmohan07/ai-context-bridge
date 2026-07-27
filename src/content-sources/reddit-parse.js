import { createItem } from '../core/schema.js';

// Pure: maps a Reddit API comment node (kind 't1') to an Item, recursing into
// replies. Returns null for non-comments and deleted/removed/empty bodies.
export function mapComment(comment, depth) {
    if (comment.kind !== 't1') return null;
    const d = comment.data;
    if (!d.body || d.body === '[deleted]' || d.body === '[removed]') return null;

    const children = d.replies?.data?.children
        ? d.replies.data.children.map(c => mapComment(c, depth + 1)).filter(Boolean)
        : [];

    return createItem({
        author: d.author,
        score: d.score || 0,
        text: d.body,
        depth,
        children
    });
}
