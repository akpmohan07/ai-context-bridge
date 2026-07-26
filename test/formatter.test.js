import { describe, it, expect } from 'vitest';
import Formatter from '../src/core/formatter.js';

describe('Formatter.format', () => {
  it('renders community, title, body and a scored item', () => {
    const doc = { community: 'r/test', title: 'T', body: 'B', items: [
      { author: 'alice', score: 5, text: 'hello', depth: 0, children: [] },
    ]};
    const out = Formatter.format(doc, { communityLabel: 'Subreddit', scoreLabel: '↑', itemsLabel: 'Comments' });
    expect(out).toContain('Subreddit: r/test');
    expect(out).toContain('Thread: T');
    expect(out).toContain('Post: B');
    expect(out).toContain('↑5 alice: hello');
  });

  it('omits the community line when no communityLabel is given', () => {
    const doc = { community: 'r/test', title: 'T', body: '', items: [] };
    const out = Formatter.format(doc, {});
    expect(out).not.toContain('r/test');
  });

  it('indents and quotes nested children', () => {
    const doc = { title: 'T', body: '', items: [
      { author: 'parent', score: 2, text: 'top', depth: 0, children: [
        { author: 'child', score: 1, text: 'reply', depth: 1, children: [] },
      ]},
    ]};
    const out = Formatter.format(doc, { scoreLabel: '↑' });
    expect(out).toContain('↑2 parent: top');
    expect(out).toContain('  > ↑1 child: reply'); // 2-space indent + "> " quote at depth 1
  });
});
