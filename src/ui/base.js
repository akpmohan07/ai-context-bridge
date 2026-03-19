class UIInjector {
    constructor(config) {
        if (new.target === UIInjector) {
            throw new Error('UIInjector is abstract and cannot be instantiated directly');
        }
        this.config = config;
        this._observer = null;
    }

    // MUST implement — returns true if a given DOM node is the injection target
    isTargetNode(node) {
        throw new Error('isTargetNode() must be implemented');
    }

    // MUST implement — returns array of DOM elements to inject into the target
    // actions: { openInClaude: fn, copyForAI: fn, ... }
    buildItems(actions) {
        throw new Error('buildItems() must be implemented');
    }

    // PROVIDED — starts a MutationObserver watching for the target element
    observe(actions) {
        if (this._observer) return;

        this._observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (this.isTargetNode(node)) {
                        this.inject(node, actions);
                    }
                }
            }
        });

        this._observer.observe(document.body, { childList: true, subtree: true });
    }

    // PROVIDED — stops the MutationObserver
    disconnect() {
        if (this._observer) {
            this._observer.disconnect();
            this._observer = null;
        }
    }

    // PROVIDED — appends built items into the target element
    inject(target, actions) {
        const items = this.buildItems(actions);
        items.forEach(item => target.appendChild(item));
    }
}
