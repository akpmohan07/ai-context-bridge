import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../src/content-sources/medium-markdown.js';

const make = (tag, html) => { const e = document.createElement(tag); e.innerHTML = html; return e; };

describe('toMarkdown', () => {
  it('headings h2/h3/h4', () => {
    expect(toMarkdown(make('h2', 'Title'))).toBe('## Title');
    expect(toMarkdown(make('h3', 'Sub'))).toBe('### Sub');
    expect(toMarkdown(make('h4', 'Deep'))).toBe('#### Deep');
  });

  it('paragraph → plain text', () => {
    expect(toMarkdown(make('p', 'hello world'))).toBe('hello world');
  });

  it('unordered list → dash bullets', () => {
    expect(toMarkdown(make('ul', '<li>a</li><li>b</li>'))).toBe('- a\n- b');
  });

  it('ordered list → numbered', () => {
    expect(toMarkdown(make('ol', '<li>a</li><li>b</li>'))).toBe('1. a\n2. b');
  });

  it('blockquote → > prefix', () => {
    expect(toMarkdown(make('blockquote', 'quote'))).toBe('> quote');
  });

  it('empty element → null', () => {
    expect(toMarkdown(make('p', '   '))).toBeNull();
  });

  it('pre → fenced code, <br> becomes newline', () => {
    const pre = document.createElement('pre');
    pre.appendChild(document.createTextNode('line1'));
    pre.appendChild(document.createElement('br'));
    pre.appendChild(document.createTextNode('line2'));
    expect(toMarkdown(pre)).toBe('```\nline1\nline2\n```');
  });
});
