class RedditMenuInjector extends MenuInjector {
    constructor() {
        super({ name: 'RedditMenuInjector' });
        this._injected = new WeakSet();
    }

    isTargetNode(node) {
        return node.tagName?.toLowerCase() === 'shreddit-post-overflow-menu';
    }

    findTarget(node) {
        if (this.isTargetNode(node)) return node;
        return node.querySelector?.('shreddit-post-overflow-menu') || null;
    }

    observe(actions) {
        if (this._observer) return;

        document.querySelectorAll('shreddit-post-overflow-menu').forEach(el => {
            this._injectButton(el, actions);
        });

        this._observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    const target = this.findTarget(node);
                    if (target) this._injectButton(target, actions);
                }
            }
        });

        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    _injectButton(overflowEl, actions) {
        if (this._injected.has(overflowEl)) return;
        this._injected.add(overflowEl);

        const asyncLoader = overflowEl.closest('shreddit-async-loader') || overflowEl.parentElement;
        if (!asyncLoader?.parentElement) return;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; display: inline-flex; align-items: center;';

        const button = document.createElement('button');
        button.setAttribute('aria-label', 'Open with AI');
        button.setAttribute('aria-haspopup', 'menu');
        button.innerHTML = 'Claude <span style="font-size:10px;margin-left:2px">▼</span>';
        button.style.cssText = `
            background: #10a37f;
            color: white;
            border: none;
            padding: 6px 12px;
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

        const dropdown = this._buildDropdown(actions);
        wrapper.appendChild(button);
        wrapper.appendChild(dropdown);

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.style.display !== 'none';
            dropdown.style.display = isOpen ? 'none' : 'block';
            button.setAttribute('aria-expanded', String(!isOpen));
        });

        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
            button.setAttribute('aria-expanded', 'false');
        });

        asyncLoader.parentElement.insertBefore(wrapper, asyncLoader);
    }

    _buildDropdown(actions) {
        const dropdown = document.createElement('div');
        dropdown.style.cssText = `
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            z-index: 9999;
            background: white;
            border: 1px solid #edeff1;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.14);
            min-width: 180px;
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
        document.querySelectorAll('.acb-reddit-toast').forEach(n => n.remove());

        const toast = document.createElement('div');
        toast.className = 'acb-reddit-toast';
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

class RedditSource extends ContentSource {
    constructor() {
        super({ name: 'Reddit' });
        this._injector = new RedditMenuInjector();
    }

    isMatch() {
        return /reddit\.com\/r\/[^/]+\/comments\//.test(window.location.href);
    }

    async fetchContent() {
        const url = window.location.href.split('?')[0].replace(/\/$/, '') + '.json';
        const response = await fetch(url);
        const data = await response.json();

        const post = data[0].data.children[0].data;
        const items = (data[1].data.children || [])
            .map(c => this._mapComment(c, 0))
            .filter(Boolean);

        return createContentDocument({
            title: post.title,
            body: post.selftext || '',
            sourceUrl: window.location.href,
            platform: 'reddit',
            community: `r/${post.subreddit}`,
            items
        });
    }

    async getFormattedContent() {
        const doc = await this.fetchContent();
        const trimmed = Budget.trim(doc);
        return Formatter.format(trimmed, {
            communityLabel: 'Subreddit',
            scoreLabel: '↑',
            itemsLabel: 'Comments'
        });
    }

    injectUI(actions) {
        this._injector.observe(actions);
    }

    // --- private ---

    _mapComment(comment, depth) {
        if (comment.kind !== 't1') return null;
        const d = comment.data;
        if (!d.body || d.body === '[deleted]' || d.body === '[removed]') return null;

        const children = d.replies?.data?.children
            ? d.replies.data.children.map(c => this._mapComment(c, depth + 1)).filter(Boolean)
            : [];

        return createItem({
            author: d.author,
            score: d.score || 0,
            text: d.body,
            depth,
            children
        });
    }
}
