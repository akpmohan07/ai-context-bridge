import { ContentSource } from './base.js';
import { Theme } from '../ui/theme.js';
import { Budget } from '../core/budget.js';
import { Formatter } from '../core/formatter.js';
import { createContentDocument } from '../core/schema.js';
import { extractBody } from './medium-markdown.js';

class MediumToolbarInjector {
    constructor() {
        this._observer = null;
    }

    observe(actions) {
        this._tryInject(actions);
        if (this._observer) return;

        // Stay connected for the page's lifetime. Medium hydrates/re-renders the
        // footer after load and removes our button (a foreign node in
        // React-managed DOM), so a one-shot injector shows it then loses it. The
        // presence guard in _tryInject keeps this to a single button.
        this._observer = new MutationObserver(() => this._tryInject(actions));
        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    _tryInject(actions) {
        if (document.querySelector('.acb-medium-launcher')) return true;

        // The share button's wrapper has a stable aria-describedby attribute
        const shareWrapper = document.querySelector('[aria-describedby="postFooterSocialMenu"]');
        if (!shareWrapper || !shareWrapper.parentElement) return false;

        // Remove any dropdown orphaned in <body> by a button that got re-rendered away.
        document.querySelectorAll('.acb-medium-dropdown').forEach(d => d.remove());

        const btn = this._buildButtonWrapper(actions);
        shareWrapper.parentElement.insertBefore(btn, shareWrapper.nextSibling);
        return true;
    }

    _buildButtonWrapper(actions) {
        const wrapper = document.createElement('div');
        wrapper.className = 'acb-medium-launcher';
        wrapper.style.cssText = 'display: inline-flex; align-items: center;';

        // Dropdown is appended to document.body so it escapes any overflow:hidden on the toolbar
        const dropdown = this._buildDropdown(actions);
        document.body.appendChild(dropdown);

        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Open with AI');
        button.setAttribute('aria-haspopup', 'menu');
        button.innerHTML = 'Open in AI <span style="font-size:10px;margin-left:2px">▼</span>';
        button.style.cssText = `
            background: ${Theme.ui.triggerBg};
            color: white;
            border: none;
            padding: 6px 14px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: inline-flex;
            align-items: center;
            gap: 4px;
            box-shadow: 0 2px 8px ${Theme.ui.triggerBg}40;
            transition: all 0.2s ease;
            white-space: nowrap;
        `;
        button.addEventListener('mouseenter', () => {
            button.style.background = Theme.ui.triggerHoverBg;
            button.style.boxShadow = `0 4px 12px ${Theme.ui.triggerBg}66`;
        });
        button.addEventListener('mouseleave', () => {
            button.style.background = Theme.ui.triggerBg;
            button.style.boxShadow = `0 2px 8px ${Theme.ui.triggerBg}40`;
        });

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.style.display !== 'none';
            if (!isOpen) {
                // Position dropdown using fixed coords from button's bounding rect
                const rect = button.getBoundingClientRect();
                dropdown.style.top = `${rect.bottom + 8}px`;
                dropdown.style.left = `${rect.left + rect.width / 2}px`;
                dropdown.style.transform = 'translateX(-50%)';
            }
            dropdown.style.display = isOpen ? 'none' : 'flex';
            button.setAttribute('aria-expanded', String(!isOpen));
        });

        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
            button.setAttribute('aria-expanded', 'false');
        });

        wrapper.appendChild(button);
        return wrapper;
    }

    _buildDropdown(actions) {
        const dropdown = document.createElement('div');
        dropdown.className = 'acb-medium-dropdown';
        dropdown.style.cssText = `
            display: none;
            flex-direction: column;
            position: fixed;
            z-index: 99999;
            background: ${Theme.ui.dropdownBg};
            border: 1px solid ${Theme.ui.dropdownBorder};
            border-radius: 12px;
            box-shadow: 0 4px 20px ${Theme.ui.shadow};
            min-width: 200px;
            overflow: hidden;
            padding: 4px 0;
        `;

        actions.destinations.forEach(dest => {
            const t = Theme[dest.theme];
            dropdown.appendChild(this._createItem(dest.label, t.accent, `linear-gradient(135deg, ${t.bg} 0%, ${t.bgTo} 100%)`, async () => {
                dropdown.style.display = 'none';
                this._showNotification(`Opening in ${dest.platform.name}…`);
                await actions.openIn(dest.platform);
            }));
        });

        dropdown.appendChild(this._createItem('Copy for AI', Theme.copy.accent, `linear-gradient(135deg, ${Theme.copy.bg} 0%, ${Theme.copy.bgTo} 100%)`, async () => {
            dropdown.style.display = 'none';
            await actions.copyForAI();
            this._showNotification('Copied to clipboard!');
        }));

        return dropdown;
    }

    _createItem(label, accentColor, bgGradient, onClick) {
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

        const arrow = document.createElement('span');
        arrow.textContent = '→';
        arrow.style.cssText = `
            background: ${accentColor};
            color: white;
            padding: 3px 7px;
            border-radius: 50%;
            font-size: 11px;
            font-weight: bold;
        `;

        item.appendChild(labelEl);
        item.appendChild(arrow);

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

    _showNotification(message) {
        document.querySelectorAll('.acb-medium-toast').forEach(n => n.remove());

        const toast = document.createElement('div');
        toast.className = 'acb-medium-toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(-8px);
            background: ${Theme.ui.toastBg};
            color: ${Theme.ui.toastText};
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-weight: 500;
            z-index: 99999;
            opacity: 0;
            transition: opacity 0.2s ease, transform 0.2s ease;
            pointer-events: none;
            white-space: nowrap;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(-50%) translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(-8px)';
            setTimeout(() => toast.remove(), 200);
        }, 3000);
    }
}

export class MediumSource extends ContentSource {
    constructor() {
        super({ name: 'Medium' });
        this._injector = new MediumToolbarInjector();
    }

    isMatch() {
        return /medium\.com/.test(window.location.href) && !!document.querySelector('article');
    }

    async fetchContent() {
        const article = document.querySelector('article');
        if (!article) throw new Error('No article found on this page');

        const title = document.querySelector('h1')?.textContent?.trim() || document.title;

        const author = (
            document.querySelector('[data-testid="authorName"]') ||
            document.querySelector('.pw-author-name') ||
            document.querySelector('a[rel="noopener follow"]')
        )?.textContent?.trim() || '';

        const date = (
            document.querySelector('[data-testid="storyPublishDate"]') ||
            document.querySelector('time')
        )?.textContent?.trim() || '';

        const body = extractBody(article);

        return createContentDocument({
            title,
            body,
            sourceUrl: window.location.href,
            platform: 'medium',
            community: date ? `${author} • ${date}` : author,
            items: []
        });
    }

    async getFormattedContent() {
        const doc = await this.fetchContent();
        const trimmed = Budget.trim(doc);
        return Formatter.format(trimmed, {
            communityLabel: 'Publication',
            scoreLabel: '',
            itemsLabel: 'Responses'
        });
    }

    injectUI(actions) {
        this._injector.observe(actions);
    }
}
