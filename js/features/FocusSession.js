
class FocusSession extends BaseFeature {
    constructor() {
        super(FEATURES.FOCUS_SESSION);
        this.topics = [];
        this.timerInterval = null;
        this.relevanceThreshold = 0.5;
        this.contentObserver = null;
        this.checkTimeout = null;
    }

    async checkContentRelevance(content, title, url) {
        if (!this.topics.length) {
            console.log('No topics set, skipping relevance check');
            return true;
        }
        
        console.log(`Checking content relevance for: ${url}`);
        console.log('Current topics:', this.topics);
        
        try {
            const prompt = `
                Given the following topics of focus: ${this.topics.join(', ')}
                
                Analyze this content for relevance:
                Title: ${title}
                URL: ${url}
                Content: ${content}
                
                Return a JSON response with:
                {
                    "isRelevant": boolean,
                    "relevanceScore": number between 0 and 1,
                    "reason": brief explanation
                }
            `;

            // This is where we'd integrate with Gemini API
            const modelSession = await LanguageModel.create();

            const response = await modelSession.prompt(prompt);

            // Parse the response and check against threshold
            const result = JSON.parse(response.text);
            return {
                ...result,
                shouldAlert: result.relevanceScore < this.relevanceThreshold
            };
        } catch (error) {
            console.error('Error checking content relevance:', error);
            return { isRelevant: true, relevanceScore: 1, shouldAlert: false };
        }
    }

    showRelevanceAlert(result, url) {
        const notification = document.createElement('div');
        notification.className = 'focus-alert';
        notification.innerHTML = `
            <div class="focus-alert-content">
                <h4>Focus Alert!</h4>
                <p>This content seems to be off-topic (${Math.round(result.relevanceScore * 100)}% relevant)</p>
                <p>${result.reason}</p>
                <p>Your focus topics: ${this.topics.join(', ')}</p>
                <button class="dismiss-btn">Dismiss</button>
            </div>
        `;

        document.body.appendChild(notification);
        
        notification.querySelector('.dismiss-btn').addEventListener('click', () => {
            notification.remove();
        });
    }

    getFeatureHTML() {
        return `
            <div id="${this.containerId}-session-form">
                <label>Topics (press Enter to add)</label>
                <input id="${this.containerId}-topic" type="text" placeholder="Type a topic and press Enter">
                <div id="${this.containerId}-topics-container"></div>

                <label>Sensitivity</label>
                <input id="${this.containerId}-threshold" type="range" min="0.3" max="0.8" step="0.1" value="0.5">

                <div id="${this.containerId}-timer" style="display: none; margin: 10px 0; text-align: center; font-weight: bold;">
                    Elapsed: <span id="${this.containerId}-elapsed-time">00:00:00</span>
                </div>
                
                <div id="${this.containerId}-buttons">
                    <button id="${this.containerId}-start-btn">Start Session</button>
                    <button id="${this.containerId}-end-btn" style="display: none;">End Session</button>
                </div>
            </div>
        `;
    }

    async init() {
        // Call parent's init to setup UI
        await super.init();
        await this.loadExistingSession();
        console.log("FocusSession initialized");
        await this.checkCurrentPageContent();
    }

    async destroy() {
        this.stopTimer();
        this.removeEventListeners();
    }

    setupEventListeners() {
        // Topic input handler
        document.getElementById(`${this.containerId}-topic`)
            .addEventListener('keypress', this.handleTopicInput.bind(this));
        
        // Start button handler
        document.getElementById(`${this.containerId}-start-btn`)
            .addEventListener('click', this.handleStartSession.bind(this));
        
        // End button handler
        document.getElementById(`${this.containerId}-end-btn`)
            .addEventListener('click', this.handleEndSession.bind(this));
    }

    removeEventListeners() {
        // Remove event listeners when feature is destroyed
        document.getElementById('topic').removeEventListener('keypress', this.handleTopicInput.bind(this));
        document.getElementById('startBtn').removeEventListener('click', this.handleStartSession.bind(this));
        document.getElementById('endBtn').removeEventListener('click', this.handleEndSession.bind(this));
    }

    handleTopicInput(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.addTopic(e.target.value);
        }
    }

    updateTopicsDisplay() {
        const container = document.getElementById(`${this.containerId}-topics-container`);
        container.innerHTML = this.topics.map(topic => `
            <span class="topic-tag">
                ${topic}
                <button data-topic="${topic}" class="remove-topic-btn">&times;</button>
            </span>
        `).join('');
        
        // Add event listeners to remove buttons
        container.querySelectorAll('.remove-topic-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.removeTopic(e.target.dataset.topic);
            });
        });
    }

    addTopic(topic) {
        topic = topic.trim();
        if (topic && !this.topics.includes(topic)) {
            this.topics.push(topic);
            this.updateTopicsDisplay();
        }
        document.getElementById(`${this.containerId}-topic`).value = '';
    }

    removeTopic(topic) {
        this.topics = this.topics.filter(t => t !== topic);
        this.updateTopicsDisplay();
    }

    formatElapsedTime(startTime) {
        const elapsed = Date.now() - startTime;
        const seconds = Math.floor((elapsed / 1000) % 60);
        const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
        const hours = Math.floor(elapsed / (1000 * 60 * 60));
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    startTimer(startTime) {
        const timerElement = document.getElementById(`${this.containerId}-timer`);
        const elapsedTimeElement = document.getElementById(`${this.containerId}-elapsed-time`);
        
        timerElement.style.display = 'block';
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            elapsedTimeElement.textContent = this.formatElapsedTime(startTime);
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        document.getElementById(`${this.containerId}-timer`).style.display = 'none';
    }

    async handleStartSession() {
        if (this.topics.length === 0) {
            return this.setError("Please add at least one topic");
        }

        const threshold = parseFloat(document.getElementById(`${this.containerId}-threshold`).value);
        const currentWindow = await chrome.windows.getCurrent();
        const windowId = currentWindow.id;

        try {
            const data = await this.loadData() || {};
            data[windowId] = {
                topics: this.topics,
                threshold,
                active: true,
                startedAt: Date.now(),
                windowId
            };

            await this.saveData(data);
            this.startTimer(data[windowId].startedAt);
            this.startContentMonitoring();
            
            // Update UI
            document.getElementById(`${this.containerId}-start-btn`).style.display = 'none';
            document.getElementById(`${this.containerId}-end-btn`).style.display = 'block';
            
            alert("Focus session started!");
        } catch (error) {
            this.setError('Error starting session: ' + error.message);
        }
    }

    startContentMonitoring() {
        // Check initial content
        // this.checkCurrentPageContent();

        // Setup observer for content changes
        if (!this.contentObserver) {
            this.contentObserver = new MutationObserver(() => {
                // Debounce content checks
                if (this.checkTimeout) {
                    clearTimeout(this.checkTimeout);
                }
                this.checkTimeout = setTimeout(() => {
                    // this.checkCurrentPageContent();
                }, 2000); // Wait 2 seconds after changes before checking
            });

            // Start observing
            this.contentObserver.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });
        }
    }

    stopContentMonitoring() {
        if (this.contentObserver) {
            this.contentObserver.disconnect();
            this.contentObserver = null;
        }
        if (this.checkTimeout) {
            clearTimeout(this.checkTimeout);
            this.checkTimeout = null;
        }
    }

    async checkCurrentPageContent() {
        try {
            const content = document.body ? String(document.body.innerText || "") : "";
            const title = document.title ? String(document.title) : "";
            const url = window.location && window.location.href ? String(window.location.href) : "";

            const result = await this.checkContentRelevance(content, title, url);
            if (result.shouldAlert) {
                this.showRelevanceAlert(result, url);
            }
        } catch (error) {
            console.error('Error checking page content:', error);
        }
    }

    async handleEndSession() {
        const currentWindow = await chrome.windows.getCurrent();
        const windowId = currentWindow.id;

        try {
            const data = await this.loadData() || {};
            data[windowId] = {
                active: false,
                windowId
            };

            await this.saveData(data);
            this.stopTimer();
            this.stopContentMonitoring();
            
            // Update UI
            document.getElementById(`${this.containerId}-end-btn`).style.display = 'none';
            document.getElementById(`${this.containerId}-start-btn`).style.display = 'block';
            
            // Notify FeatureManager
            await window.featureManager.disableFeature(this.config.id);
            
            alert("Focus session ended!");
        } catch (error) {
            this.setError('Error ending session: ' + error.message);
        }
    }

    async loadExistingSession() {
        try {
            // const currentWindow = await chrome.windows.getCurrent();
            const windowId =  898077558 //currentWindow.id;
            
            const data = await this.loadData();
            const currentSession = data?.[windowId];
            
            if (currentSession?.active) {
                this.topics = [...(currentSession.topics || [])];
                // this.updateTopicsDisplay();
                // document.getElementById('threshold').value = currentSession.threshold || '';
                
                if (currentSession.startedAt) {
                    this.startTimer(currentSession.startedAt);
                }
            }
        } catch (error) {
            this.setError('Error loading session: ' + error.message);
        }
    }
}