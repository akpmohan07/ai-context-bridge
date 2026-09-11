import { describe, it, expect } from 'vitest';
import { createContentDocument, createItem } from '../src/core/schema.js';

describe('createContentDocument', () => {
  it('fills every field with a default when called empty', () => {
    expect(createContentDocument()).toEqual({
      title: '', body: '', sourceUrl: '', platform: '', community: '', items: [],
    });
  });

  it('keeps provided values and defaults the rest', () => {
    const doc = createContentDocument({ title: 'T', platform: 'reddit' });
    expect(doc.title).toBe('T');
    expect(doc.platform).toBe('reddit');
    expect(doc.items).toEqual([]);
    expect(doc.body).toBe('');
  });
});

describe('createItem', () => {
  it('defaults score to 0 and children to an empty array', () => {
    expect(createItem()).toEqual({ author: '', score: 0, text: '', depth: 0, children: [] });
  });

  it('preserves provided values', () => {
    const it_ = createItem({ author: 'a', score: 7, text: 'hi', depth: 2 });
    expect(it_).toMatchObject({ author: 'a', score: 7, text: 'hi', depth: 2 });
    expect(it_.children).toEqual([]);
  });
});
