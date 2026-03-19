class BaseFeature {
    constructor(config) {
        this.config = config;
        this.containerId = `feature-${config.id}`;
    }

    async init() {
        // Ensure UI container exists
        await this.initializeUI();
        this.showUI();
    }

    async destroy() {
        this.hideUI();
        // Additional cleanup logic can be added here
    }

    async initializeUI() {
        let container = document.getElementById(this.containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = this.containerId;
            container.className = 'feature-container';
            document.getElementById('features-root').appendChild(container);
        }
        container.innerHTML = this.getFeatureHTML();
        this.setupEventListeners();
    }

    getFeatureHTML() {
        // Override this in feature classes to provide feature-specific HTML
        return '';
    }

    setupEventListeners() {
        // Override this in feature classes to setup event handlers
    }

    removeEventListeners() {
        // Override this in feature classes to cleanup event handlers
    }

    showUI() {
        const allFeatures = document.querySelectorAll('.feature-container');
        allFeatures.forEach(feature => feature.style.display = 'none');
        
        const container = document.getElementById(this.containerId);
        if (container) {
            container.style.display = 'block';
        }
    }

    hideUI() {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.style.display = 'none';
        }
    }

    async saveData(data) {
        if (!chrome?.storage?.local) return;
        await chrome.storage.local.set({ [this.config.storageKey]: data });
    }

    async loadData() {
        if (!chrome?.storage?.local) return null;
        const result = await chrome.storage.local.get(this.config.storageKey);
        return result[this.config.storageKey];
    }

    setError(message) {
        console.error(`[${this.config.name}]:`, message);
        alert(message);
    }
}