import { describe, it, expect } from 'vitest';
import { mapComment } from '../src/content-sources/reddit-parse.js';

const comment = (data, kind = 't1') => ({ kind, data });

describe('mapComment', () => {
  it('skips non-comment nodes (kind !== t1)', () => {
    expect(mapComment(comment({ body: 'x' }, 'more'), 0)).toBeNull();
  });

  it('skips deleted, removed, and empty bodies', () => {
    expect(mapComment(comment({ body: '[deleted]' }), 0)).toBeNull();
    expect(mapComment(comment({ body: '[removed]' }), 0)).toBeNull();
    expect(mapComment(comment({ body: '' }), 0)).toBeNull();
  });

  it('maps a valid comment to an Item', () => {
    const item = mapComment(comment({ author: 'alice', score: 5, body: 'hello' }), 0);
    expect(item).toMatchObject({ author: 'alice', score: 5, text: 'hello', depth: 0 });
    expect(item.children).toEqual([]);
  });

  it('defaults a missing score to 0', () => {
    const item = mapComment(comment({ author: 'a', body: 'hi' }), 2);
    expect(item.score).toBe(0);
    expect(item.depth).toBe(2);
  });

  it('recurses into replies, incrementing depth and filtering dead children', () => {
    const node = comment({
      author: 'parent', score: 9, body: 'top',
      replies: { data: { children: [
        comment({ author: 'child', score: 3, body: 'reply', replies: '' }),
        comment({ author: 'ghost', score: 1, body: '[deleted]' }), // filtered out
      ] } },
    });
    const item = mapComment(node, 0);
    expect(item.children).toHaveLength(1);
    expect(item.children[0]).toMatchObject({ author: 'child', text: 'reply', depth: 1 });
  });
});
