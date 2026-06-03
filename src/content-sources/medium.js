class MediumToolbarInjector {
    constructor() {
        this._injected = false;
        this._observer = null;
    }

    observe(actions) {
        if (this._tryInject(actions)) return;

        this._observer = new MutationObserver(() => {
            if (this._tryInject(actions)) {
                this._observer.disconnect();
                this._observer = null;
            }
        });
        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    _tryInject(actions) {
        if (this._injected) return true;

        // The share button's wrapper has a stable aria-describedby attribute
        const shareWrapper = document.querySelector('[aria-describedby="postFooterSocialMenu"]');
        if (!shareWrapper || !shareWrapper.parentElement) return false;

        this._injected = true;
        const btn = this._buildButtonWrapper(actions);
        shareWrapper.parentElement.insertBefore(btn, shareWrapper.nextSibling);
        return true;
    }

    _buildButtonWrapper(actions) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: inline-flex; align-items: center;';

        // Dropdown is appended to document.body so it escapes any overflow:hidden on the toolbar
        const dropdown = this._buildDropdown(actions);
        document.body.appendChild(dropdown);

        // Match Medium's toolbar button style: circular, icon + small label beneath
        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Open with AI');
        button.setAttribute('aria-haspopup', 'menu');
        button.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            color: rgba(41, 41, 41, 1);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            transition: background 0.1s ease;
        `;

        const icon = document.createElement('span');
        icon.textContent = '🤖';
        icon.style.cssText = 'font-size: 24px; line-height: 1; display: block;';

        const label = document.createElement('div');
        label.textContent = 'AI';
        label.style.cssText = `
            font-size: 11px;
            color: rgba(41, 41, 41, 0.6);
            white-space: nowrap;
        `;

        button.appendChild(icon);
        button.appendChild(label);

        button.addEventListener('mouseenter', () => button.style.background = 'rgba(0,0,0,0.06)');
        button.addEventListener('mouseleave', () => button.style.background = 'none');

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
        dropdown.style.cssText = `
            display: none;
            flex-direction: column;
            position: fixed;
            z-index: 99999;
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.14);
            min-width: 200px;
            overflow: hidden;
            padding: 4px 0;
        `;

        dropdown.appendChild(this._createItem('🤖', 'Open in Claude', async () => {
            dropdown.style.display = 'none';
            this._showNotification('🤖 Opening in Claude…');
            await actions.openInClaude();
        }));

        dropdown.appendChild(this._createItem('📋', 'Copy for AI', async () => {
            dropdown.style.display = 'none';
            await actions.copyForAI();
            this._showNotification('📋 Copied to clipboard!');
        }));

        return dropdown;
    }

    _createItem(icon, label, onClick) {
        const item = document.createElement('div');
        item.setAttribute('role', 'menuitem');
        item.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 16px;
            cursor: pointer;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-weight: 500;
            color: #1c1c1c;
            white-space: nowrap;
            transition: background 0.1s ease;
        `;

        const iconEl = document.createElement('span');
        iconEl.style.cssText = 'font-size: 16px; width: 20px; text-align: center; flex-shrink: 0;';
        iconEl.textContent = icon;

        const labelEl = document.createElement('span');
        labelEl.textContent = label;

        item.appendChild(iconEl);
        item.appendChild(labelEl);

        item.addEventListener('mouseenter', () => item.style.background = '#f5f5f5');
        item.addEventListener('mouseleave', () => item.style.background = '');
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
            background: #1c1c1c;
            color: white;
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

class MediumSource extends ContentSource {
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

        const body = this._extractBody(article);

        return createContentDocument({
            title,
            body,
            sourceUrl: window.location.href,
            platform: 'medium',
            community: date ? `${author} • ${date}` : author,
            items: []
        });
    }

    // Converts article DOM to markdown-like text, preserving structure and code blocks.
    // Queries top-level semantic blocks only (filters out nested matches to avoid duplication).
    _extractBody(article) {
        const selector = 'h2, h3, h4, p, pre, blockquote, ul, ol';

        const topLevel = Array.from(article.querySelectorAll(selector))
            .filter(el => !el.parentElement.closest(selector));

        return topLevel
            .map(el => this._toMarkdown(el))
            .filter(Boolean)
            .join('\n\n');
    }

    _toMarkdown(el) {
        const tag = el.tagName.toLowerCase();
        const text = el.textContent.trim();
        if (!text) return null;

        switch (tag) {
            case 'h2': return `## ${text}`;
            case 'h3': return `### ${text}`;
            case 'h4': return `#### ${text}`;
            case 'pre': return `\`\`\`\n${this._extractPreText(el)}\n\`\`\``;
            case 'blockquote':
                return text.split('\n').filter(l => l.trim()).map(l => `> ${l}`).join('\n');
            case 'ul':
                return Array.from(el.querySelectorAll('li'))
                    .map(li => `- ${li.textContent.trim()}`)
                    .filter(Boolean).join('\n');
            case 'ol':
                return Array.from(el.querySelectorAll('li'))
                    .map((li, i) => `${i + 1}. ${li.textContent.trim()}`)
                    .filter(Boolean).join('\n');
            default: return text; // p
        }
    }

    // Recursively extracts text from a <pre>, converting <br> to \n so each
    // code line is preserved (Medium renders lines as <span>s with <br> separators).
    _extractPreText(node) {
        let text = '';
        for (const child of node.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
                text += child.textContent;
            } else if (child.nodeName === 'BR') {
                text += '\n';
            } else {
                text += this._extractPreText(child);
            }
        }
        return text;
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
