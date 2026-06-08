class MenuInjector extends UIInjector {
    constructor(config) {
        super(config);
        this._injectedMenus = new WeakSet(); // prevent double-injection
    }

    // Override inject to guard against injecting into the same menu twice
    inject(target, actions) {
        if (this._injectedMenus.has(target)) return;
        this._injectedMenus.add(target);
        const items = this.buildItems(actions);
        items.forEach(item => target.appendChild(item));
    }
}
