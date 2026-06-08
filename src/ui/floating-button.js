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
                            <span>🚀 Summarize and Continue in New Chat</span>
                            <span class="cb-action-icon">→</span>
                        </div>
                        <div class="cb-option" data-action="claude-opinion">
                            <span>🤔 Get Claude's opinion</span>
                            <span class="cb-action-icon">→</span>
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
            background: Theme.ui.toastBg,
            color: Theme.ui.toastText,
            padding: '12px 18px',
            borderRadius: '8px',
            fontSize: '14px',
            zIndex: '10000',
            boxShadow: `0 4px 12px ${Theme.ui.shadow}`,
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
                background: ${Theme.ui.triggerBg};
                color: white;
                border: none;
                padding: 12px 18px;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px ${Theme.ui.triggerBg}4d;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: all 0.2s ease;
            }
            .cb-main-btn:hover {
                background: ${Theme.ui.triggerHoverBg};
                transform: translateY(-1px);
                box-shadow: 0 6px 16px ${Theme.ui.triggerBg}66;
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
                background: ${Theme.ui.dropdownBg};
                border: 1px solid ${Theme.ui.dropdownBorder};
                border-radius: 12px;
                box-shadow: 0 10px 25px ${Theme.ui.shadow};
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
                background: ${Theme.ui.dropdownBorder};
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
                color: ${Theme.ui.text};
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
                background: linear-gradient(135deg, ${Theme.chatgpt.bg} 0%, ${Theme.chatgpt.bgTo} 100%);
                font-weight: 600;
                border: 1px solid ${Theme.chatgpt.accent}33;
                box-shadow: 0 2px 6px ${Theme.chatgpt.accent}1a;
                border-radius: 6px;
            }
            .cb-option[data-action="all-context"]:hover {
                opacity: 0.9;
                transform: translateY(-2px);
                box-shadow: 0 6px 12px ${Theme.chatgpt.accent}33;
            }
            .cb-option[data-action="claude-opinion"] {
                background: linear-gradient(135deg, ${Theme.claude.bg} 0%, ${Theme.claude.bgTo} 100%);
                font-weight: 600;
                border: 1px solid ${Theme.claude.accent}33;
                box-shadow: 0 2px 6px ${Theme.claude.accent}1a;
                border-radius: 6px;
            }
            .cb-option[data-action="claude-opinion"]:hover {
                opacity: 0.9;
                transform: translateY(-2px);
                box-shadow: 0 6px 12px ${Theme.claude.accent}33;
            }
            .cb-action-icon {
                background: ${Theme.chatgpt.accent};
                color: white;
                padding: 6px 10px;
                border-radius: 50%;
                font-size: 12px;
                font-weight: bold;
                transition: all 0.2s ease;
            }
            .cb-option[data-action="claude-opinion"] .cb-action-icon { background: ${Theme.claude.accent}; }
            .cb-disabled { opacity: 0.5; cursor: not-allowed; }
            .cb-disabled:hover { background: transparent; }
            .cb-badge {
                background: ${Theme.ui.dropdownBorder};
                color: ${Theme.ui.textWeak};
                font-size: 9px;
                font-weight: 600;
                padding: 4px 8px;
                border-radius: 10px;
                text-transform: uppercase;
                letter-spacing: 0.3px;
            }
            .cb-divider {
                margin: 8px 16px;
                border: none;
                border-top: 1px solid ${Theme.ui.dropdownBorder};
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
