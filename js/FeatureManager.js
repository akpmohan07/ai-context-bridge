class FeatureManager {
    constructor() {
        this.features = new Map();
        this.activeFeatures = new Set();
        this.initializeFeaturesList();
    }

    initializeFeaturesList() {
        document.addEventListener('DOMContentLoaded', () => {
            const listContainer = document.getElementById('features-list');
            if (!listContainer) return;

            // Clear existing items
            listContainer.innerHTML = '';

            // Add feature items
            this.features.forEach((handler, id) => {
                const featureItem = document.createElement('div');
                featureItem.className = 'feature-item';
                featureItem.innerHTML = `
                    <h3>${handler.config.name}</h3>
                    <button id="btn-${id}" data-feature-id="${id}">Enable</button>
                `;

                const button = featureItem.querySelector('button');
                button.addEventListener('click', async (e) => {
                    const featureId = e.target.dataset.featureId;
                    const feature = this.features.get(featureId);
                    
                    if (!this.activeFeatures.has(featureId)) {
                        await this.enableFeature(featureId);
                        button.textContent = 'Running';
                        button.classList.add('disable');
                        button.disabled = true; // Can only be disabled via end session
                    }
                });

                listContainer.appendChild(featureItem);
            });
        });
    }

    registerFeature(featureId, handler) {
        this.features.set(featureId, handler);
    }

    async initFeature(featureId) {
        const handler = this.features.get(featureId);
        if (handler && handler.init) {
            await handler.init();
            this.activeFeature = featureId;
        }
    }

    async destroyFeature(featureId) {
        const handler = this.features.get(featureId);
        if (handler && handler.destroy) {
            await handler.destroy();
            if (this.activeFeature === featureId) {
                this.activeFeature = null;
            }
        }
    }

    getFeature(featureId) {
        return this.features.get(featureId);
    }

    async enableFeature(featureId) {
        const handler = this.features.get(featureId);
        if (handler && handler.init) {
            await handler.init();
            this.activeFeatures.add(featureId);
        }
    }

    async disableFeature(featureId) {
        const handler = this.features.get(featureId);
        if (handler && handler.destroy) {
            await handler.destroy();
            this.activeFeatures.delete(featureId);
            
            // Update button state
            const button = document.getElementById(`btn-${featureId}`);
            if (button) {
                button.textContent = 'Enable';
                button.classList.remove('disable');
                button.disabled = false;
            }
        }
    }
}