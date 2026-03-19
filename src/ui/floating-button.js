class FloatingButton extends UIInjector {
    constructor() {
        super({ name: 'FloatingButton' });
    }

    isTargetNode(node) {
        return false; // not used — floating button uses its own observe()
    }

    buildItems(actions) {
        const existing = document.getElementById('ai-context-bridge');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'ai-context-bridge';
        container.innerHTML = `
            <div class="context-bridge-dropdown">
                <button class="cb-main-btn" id="cb-main-button">
                    <span>AI Context Bridge</span>
                    <span class="cb-arrow">▼</span>
                </button>
                <div class="cb-dropdown-menu" id="cb-menu" style="display: none;">
                    <div class="cb-section">
                        <div class="cb-option" data-action="all-context">
                            <span>🚀 h Summarize and Continue in New Chat</span>
                            <span class="cb-action-icon">→</span>
                        </div>
                        <div class="cb-option" data-action="claude-opinion">
                            <span>🤔 Get Claude's opinion</span>
                            <span class="cb-action-icon">→</span>
                        </div>
                    </div>
                    <hr class="cb-divider">
                    <div class="cb-section cb-coming-soon">
                        <div class="cb-option cb-disabled" data-action="specific-context">
                            <span>🎯 Continue with specific topic</span>
                            <span class="cb-badge">Coming Soon</span>
                        </div>
                        <div class="cb-option cb-disabled" data-action="bookmark-context">
                            <span>🔖 Bookmark this context</span>
                            <span class="cb-badge">Coming Soon</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '9999'
        });

        this._addStyles();
        this._setupEvents(container, actions);
        return container;
    }

    // Inject immediately then guard against React removing our button
    observe(actions) {
        this.inject(document.body, actions);

        this._observer = new MutationObserver(() => {
            if (!document.getElementById('ai-context-bridge')) {
                this.inject(document.body, actions);
            }
        });
        this._observer.observe(document.body, { childList: true });
    }

    inject(target, actions) {
        target.appendChild(this.buildItems(actions));
    }

    showNotification(message) {
        document.querySelectorAll('.cb-notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'cb-notification';
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            background: '#1f2937',
            color: 'white',
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: '10000',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            opacity: '0',
            transform: 'translateY(-20px)',
            transition: 'all 0.3s ease',
            maxWidth: '300px'
        });
        notification.textContent = message;
        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-20px)';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    // --- private ---

    _setupEvents(container, actions) {
        const button = container.querySelector('#cb-main-button');
        const menu = container.querySelector('#cb-menu');
        const dropdown = container.querySelector('.context-bridge-dropdown');

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = menu.style.display === 'none' || !menu.style.display;
            if (isHidden) {
                menu.style.display = 'block';
                dropdown.classList.add('open');
                requestAnimationFrame(() => menu.classList.add('show'));
            } else {
                this._closeMenu(menu, dropdown);
            }
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) this._closeMenu(menu, dropdown);
        });

        container.querySelector('[data-action="all-context"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeMenu(menu, dropdown);
            this._setLoading(button, 'Processing...');
            actions.summarizeAndContinue();
            setTimeout(() => this._resetButton(button), 3000);
        });

        container.querySelector('[data-action="claude-opinion"]').addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeMenu(menu, dropdown);
            this._setLoading(button, 'Opening Claude...');
            this.showNotification('🚀 Sending summary to Claude...');
            actions.getClaudeOpinion();
            setTimeout(() => this._resetButton(button), 2000);
        });

        container.querySelectorAll('.cb-disabled').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const name = option.querySelector('span').textContent;
                this.showNotification(`🚀 "${name}" coming soon! Star our GitHub to get notified.`);
            });
        });
    }

    _closeMenu(menu, dropdown) {
        menu.classList.remove('show');
        dropdown.classList.remove('open');
        setTimeout(() => { menu.style.display = 'none'; }, 200);
    }

    _setLoading(button, text) {
        button._originalHTML = button.innerHTML;
        button.innerHTML = `<span>${text}</span>`;
        button.disabled = true;
    }

    _resetButton(button) {
        if (button._originalHTML) {
            button.innerHTML = button._originalHTML;
            delete button._originalHTML;
        }
        button.disabled = false;
    }

    _addStyles() {
        if (document.getElementById('cb-styles')) return;
        const style = document.createElement('style');
        style.id = 'cb-styles';
        style.textContent = `
            .context-bridge-dropdown {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .cb-main-btn {
                background: #10a37f;
                color: white;
                border: none;
                padding: 12px 18px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(16, 163, 127, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s ease;
            }
            .cb-main-btn:hover {
                background: #0d9f6b;
                transform: translateY(-1px);
                box-shadow: 0 6px 16px rgba(16, 163, 127, 0.4);
            }
            .cb-main-btn:active { transform: translateY(0); }
            .cb-arrow {
                font-size: 12px;
                transition: transform 0.2s ease;
            }
            .cb-dropdown-menu {
                position: absolute;
                bottom: 100%;
                right: 0;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                min-width: 280px;
                margin-bottom: 8px;
                opacity: 0;
                transform: translateY(10px);
                transition: all 0.2s ease;
                overflow: hidden;
            }
            .cb-dropdown-menu.show { opacity: 1; transform: translateY(0); }
            .cb-section { padding: 8px 0; }
            .cb-section.cb-coming-soon {
                background: linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%);
                margin: 0 8px;
                border-radius: 8px;
                padding: 12px 8px;
            }
            .cb-option {
                padding: 14px 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-size: 14px;
                border-radius: 6px;
                margin: 2px 8px;
                transition: all 0.2s ease;
            }
            .cb-option span:first-of-type {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
                font-weight: 500;
            }
            .cb-option[data-action="all-context"] {
                background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
                font-weight: 600;
                border: 1px solid #10a37f;
                box-shadow: 0 2px 6px rgba(16, 163, 127, 0.1);
                border-radius: 6px;
            }
            .cb-option[data-action="all-context"]:hover {
                background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
                transform: translateY(-2px);
                box-shadow: 0 6px 12px rgba(16, 163, 127, 0.2);
            }
            .cb-option[data-action="claude-opinion"] {
                background: linear-gradient(135deg, #fef3f2 0%, #fed7d3 100%);
                font-weight: 600;
                border: 1px solid #f59e0b;
                box-shadow: 0 2px 6px rgba(245, 158, 11, 0.1);
                border-radius: 6px;
            }
            .cb-option[data-action="claude-opinion"]:hover {
                background: linear-gradient(135deg, #fed7d3 0%, #fbbf24 100%);
                transform: translateY(-2px);
                box-shadow: 0 6px 12px rgba(245, 158, 11, 0.2);
            }
            .cb-action-icon {
                background: #10a37f;
                color: white;
                padding: 6px 10px;
                border-radius: 50%;
                font-size: 12px;
                font-weight: bold;
                transition: all 0.2s ease;
            }
            .cb-option[data-action="claude-opinion"] .cb-action-icon { background: #f59e0b; }
            .cb-disabled { opacity: 0.7; cursor: not-allowed; }
            .cb-disabled:hover { background: #f9fafb; }
            .cb-badge {
                background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
                color: #6b7280;
                font-size: 9px;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 10px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
                border: 1px solid #d1d5db;
            }
            .cb-divider {
                margin: 8px 16px;
                border: none;
                border-top: 1px solid #f1f5f9;
                opacity: 0.6;
            }
            .context-bridge-dropdown.open .cb-arrow { transform: rotate(180deg); }
            @media (max-width: 480px) {
                .cb-dropdown-menu { min-width: 260px; right: -10px; }
            }
        `;
        document.head.appendChild(style);
    }
}
