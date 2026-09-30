import { Theme } from './theme.js';

// One row of a content source's "Open with AI" dropdown (Reddit, Medium).
// `icon` is the badge on the right: 'arrow' for destinations that open a
// chat, 'copy' for actions that stay on the page (Copy for AI).
//
// The copy glyph is built with createElementNS, not innerHTML: host pages
// may enforce Trusted Types, and an inline SVG renders the same on every
// OS/font, unlike an emoji.
const SVG_NS = 'http://www.w3.org/2000/svg';

function copyGlyph() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '11');
    svg.setAttribute('height', '11');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.5');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const back = document.createElementNS(SVG_NS, 'path');
    back.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
    const front = document.createElementNS(SVG_NS, 'rect');
    front.setAttribute('x', '9');
    front.setAttribute('y', '9');
    front.setAttribute('width', '13');
    front.setAttribute('height', '13');
    front.setAttribute('rx', '2');
    svg.append(back, front);
    return svg;
}

export function createMenuItem({ label, accentColor, bgGradient, icon = 'arrow', onClick }) {
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        margin: 4px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 500;
        color: ${Theme.ui.text};
        white-space: nowrap;
        background: ${bgGradient};
        border: 1px solid ${accentColor}33;
        transition: all 0.15s ease;
    `;

    const labelEl = document.createElement('span');
    labelEl.textContent = label;

    // Fixed-size circle so the arrow and the copy glyph line up identically.
    const badge = document.createElement('span');
    badge.dataset.icon = icon;
    badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        background: ${accentColor};
        color: white;
        border-radius: 50%;
        font-size: 11px;
        font-weight: bold;
    `;
    if (icon === 'copy') badge.appendChild(copyGlyph());
    else badge.textContent = '→';

    item.appendChild(labelEl);
    item.appendChild(badge);

    item.addEventListener('mouseenter', () => {
        item.style.opacity = '0.92';
        item.style.transform = 'translateX(3px)';
        item.style.boxShadow = `0 3px 10px ${accentColor}40`;
    });
    item.addEventListener('mouseleave', () => {
        item.style.opacity = '1';
        item.style.transform = 'translateX(0)';
        item.style.boxShadow = 'none';
    });
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    return item;
}
