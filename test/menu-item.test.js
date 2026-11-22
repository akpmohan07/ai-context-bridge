import { describe, it, expect, vi } from 'vitest';
import { createMenuItem } from '../src/ui/menu-item.js';

const base = { label: 'Claude', accentColor: '#d97757', bgGradient: 'none', onClick: () => {} };
const badge = (item) => item.querySelector('[data-icon]');

describe('createMenuItem', () => {
  it('destinations get the → arrow by default', () => {
    const item = createMenuItem(base);
    expect(item.textContent).toContain('Claude');
    expect(badge(item).dataset.icon).toBe('arrow');
    expect(badge(item).textContent).toBe('→');
  });

  it("Copy for AI gets a copy glyph, not the arrow", () => {
    const item = createMenuItem({ ...base, label: 'Copy for AI', icon: 'copy' });
    expect(badge(item).dataset.icon).toBe('copy');
    expect(badge(item).textContent).not.toContain('→');
    expect(badge(item).querySelector('svg')).not.toBeNull();
  });

  it('click runs onClick without bubbling to the page', () => {
    const onClick = vi.fn();
    const pageClick = vi.fn();
    const item = createMenuItem({ ...base, onClick });
    document.body.appendChild(item);
    document.body.addEventListener('click', pageClick);
    item.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(pageClick).not.toHaveBeenCalled();
    item.remove();
  });
});
