import { describe, it, expect } from 'vitest';
import Budget from '../src/core/budget.js';

const item = (over = {}) => ({ author: 'u', score: 0, text: 'x', depth: 0, children: [], ...over });

describe('Budget.trim', () => {
  it('exposes the default word budget', () => {
    expect(Budget.DEFAULT_WORD_BUDGET).toBe(4000);
  });

  it('orders kept items by score, highest first', () => {
    const doc = { title: 'T', body: '', items: [
      item({ author: 'low', score: 1, text: 'three word item' }),
      item({ author: 'high', score: 10, text: 'three word item' }),
    ]};
    const out = Budget.trim(doc, 100);
    expect(out.items[0].author).toBe('high');
    expect(out.items[1].author).toBe('low');
  });

  it('drops [deleted] and [removed] items', () => {
    const doc = { title: '', body: '', items: [
      item({ author: 'a', score: 9, text: '[deleted]' }),
      item({ author: 'b', score: 8, text: '[removed]' }),
      item({ author: 'c', score: 7, text: 'real content here' }),
    ]};
    const out = Budget.trim(doc, 100);
    expect(out.items.map(i => i.author)).toEqual(['c']);
  });

  it('skips items larger than the remaining budget', () => {
    const doc = { title: '', body: '', items: [
      item({ author: 'big', score: 5, text: 'one two three four five' }), // 5 words
    ]};
    const out = Budget.trim(doc, 3); // budget too small for the 5-word item
    expect(out.items).toHaveLength(0);
  });

  it('subtracts title and body from the budget before items', () => {
    const doc = { title: 'one two three', body: 'four five', items: [
      item({ author: 'x', score: 1, text: 'six seven eight nine ten' }), // 5 words
    ]};
    // budget 8: title(3) + body(2) = 5 used, 3 remain → 5-word item can't fit
    const out = Budget.trim(doc, 8);
    expect(out.items).toHaveLength(0);
  });
});
