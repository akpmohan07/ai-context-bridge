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

        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Open with AI');
        button.setAttribute('aria-haspopup', 'menu');
        button.innerHTML = 'Claude <span style="font-size:10px;margin-left:2px">▼</span>';
        button.style.cssText = `
            background: #10a37f;
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
            box-shadow: 0 2px 8px rgba(16,163,127,0.25);
            transition: all 0.2s ease;
            white-space: nowrap;
        `;
        button.addEventListener('mouseenter', () => {
            button.style.background = '#0d9f6b';
            button.style.boxShadow = '0 4px 12px rgba(16,163,127,0.4)';
        });
        button.addEventListener('mouseleave', () => {
            button.style.background = '#10a37f';
            button.style.boxShadow = '0 2px 8px rgba(16,163,127,0.25)';
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

        dropdown.appendChild(this._createItem('Open in Claude', '#10a37f', 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', async () => {
            dropdown.style.display = 'none';
            this._showNotification('Opening in Claude…');
            await actions.openInClaude();
        }));

        dropdown.appendChild(this._createItem('Copy for AI', '#f59e0b', 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)', async () => {
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
            color: #1c1c1c;
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

        item.addEventListener('mouseenter', () => item.style.opacity = '0.85');
        item.addEventListener('mouseleave', () => item.style.opacity = '1');
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
