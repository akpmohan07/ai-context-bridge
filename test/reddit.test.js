import { describe, it, expect } from 'vitest';
import { parsePost, parseComments } from '../src/content-sources/reddit-parse.js';

// jsdom parses these fragments; the parsers only read attributes + slotted text.
const postHTML = `
  <shreddit-post
    post-title="Why do cats purr?"
    score="1234"
    subreddit-prefixed-name="r/AskScience"
    author="curious_cat">
    <div slot="text-body">Some <b>rich</b> body text.</div>
  </shreddit-post>`;

const comment = (depth, author, score, body) => `
  <shreddit-comment depth="${depth}" author="${author}" score="${score}">
    <div slot="comment">${body}</div>
  </shreddit-comment>`;

function els(html) {
  document.body.innerHTML = html;
  return [...document.querySelectorAll('shreddit-comment')];
}
function post(html) {
  document.body.innerHTML = html;
  return document.querySelector('shreddit-post');
}

describe('parsePost', () => {
  it('pulls title, body and community from a <shreddit-post>', () => {
    expect(parsePost(post(postHTML))).toEqual({
      title: 'Why do cats purr?',
      body: 'Some rich body text.',
      community: 'r/AskScience',
    });
  });

  it('derives r/<name> from subreddit-name when the prefixed attr is absent', () => {
    const el = post('<shreddit-post post-title="t" subreddit-name="pics"></shreddit-post>');
    expect(parsePost(el)).toMatchObject({ community: 'r/pics', body: '' });
  });
});

describe('parseComments', () => {
  it('maps a flat list to Items with author, numeric score and depth', () => {
    const [item] = parseComments(els(comment(0, 'alice', '42', 'hello')));
    expect(item).toMatchObject({ author: 'alice', score: 42, text: 'hello', depth: 0 });
    expect(item.children).toEqual([]);
  });

  it('defaults a missing/blank score to 0', () => {
    const [item] = parseComments(els('<shreddit-comment depth="0" author="a"><div slot="comment">hi</div></shreddit-comment>'));
    expect(item.score).toBe(0);
  });

  it('skips deleted, removed and empty bodies', () => {
    const list = els(
      comment(0, 'a', '1', '[deleted]') + comment(0, 'b', '1', '[removed]') +
      comment(0, 'c', '1', '') + comment(0, 'd', '1', 'kept')
    );
    const roots = parseComments(list);
    expect(roots).toHaveLength(1);
    expect(roots[0].author).toBe('d');
  });

  it('rebuilds nesting from the depth attribute', () => {
    const roots = parseComments(els(
      comment(0, 'top', '10', 'top comment') +
      comment(1, 'reply', '5', 'a reply') +
      comment(2, 'nested', '2', 'deeper') +
      comment(0, 'sibling', '8', 'another top')
    ));
    expect(roots).toHaveLength(2);
    expect(roots[0]).toMatchObject({ author: 'top' });
    expect(roots[0].children[0]).toMatchObject({ author: 'reply', depth: 1 });
    expect(roots[0].children[0].children[0]).toMatchObject({ author: 'nested', depth: 2 });
    expect(roots[1]).toMatchObject({ author: 'sibling' });
  });

  it('a [deleted] parent: its surviving reply attaches to the nearest live ancestor', () => {
    const roots = parseComments(els(
      comment(0, 'root', '10', 'root') +
      comment(1, 'ghost', '0', '[deleted]') + // skipped
      comment(2, 'orphan', '3', 'still here')
    ));
    expect(roots).toHaveLength(1);
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0]).toMatchObject({ author: 'orphan', depth: 2 });
  });
});
