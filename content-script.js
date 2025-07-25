console.log("Content script loaded at", new Date().toISOString());

// Simplified dropdown creation function
function createFloatingButton() {
    // Remove any existing dropdown
    const existing = document.getElementById('ai-context-bridge');
    if (existing) existing.remove();

    // Create main container
    const container = document.createElement("div");
    container.id = 'ai-context-bridge';
    container.innerHTML = `
        <div class="context-bridge-dropdown">
            <button class="cb-main-btn" id="cb-main-button">
                <span>AI Context Bridge</span>
                <span class="cb-arrow">▼</span>
            </button>
            <div class="cb-dropdown-menu" id="cb-menu" style="display: none;">
                
                <!-- Working Features -->
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

                <hr class="cb-divider">

                <!-- Key Coming Soon Features -->
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

    // Add CSS styles
    addDropdownStyles();
    
    // Position the dropdown
    Object.assign(container.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "9999"
    });

    // Add to DOM
    document.body.appendChild(container);

    // Setup event listeners
    setupDropdownEvents(container);
}

// CSS styles for the simplified dropdown
function addDropdownStyles() {
    if (document.getElementById('cb-styles')) return; // Prevent duplicate styles
    
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
        
        .cb-main-btn:active {
            transform: translateY(0);
        }
        
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
        
        .cb-dropdown-menu.show {
            opacity: 1;
            transform: translateY(0);
        }
        
        .cb-section {
            padding: 8px 0;
        }
        
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
        
        /* Working feature styling - Summarize and Continue */
        .cb-option[data-action="all-context"] {
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            border-left: 3px solid #10a37f;
            font-weight: 600;
            border: 1px solid #10a37f;
            box-shadow: 0 2px 6px rgba(16, 163, 127, 0.1);
            border-radius: 6px;
        }

        .cb-option[data-action="all-context"]:hover {
            background: linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%);
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(16, 163, 127, 0.2);
            border-color: #0d9f6b;
        }

        .cb-option[data-action="all-context"]:active {
            transform: translateY(0);
            background: linear-gradient(135deg, #bae6fd 0%, #7dd3fc 100%);
            box-shadow: 0 2px 4px rgba(16, 163, 127, 0.1);
        }

        /* Claude opinion styling */
        .cb-option[data-action="claude-opinion"] {
            background: linear-gradient(135deg, #fef3f2 0%, #fed7d3 100%);
            border-left: 3px solid #f59e0b;
            font-weight: 600;
            border: 1px solid #f59e0b;
            box-shadow: 0 2px 6px rgba(245, 158, 11, 0.1);
            border-radius: 6px;
        }

        .cb-option[data-action="claude-opinion"]:hover {
            background: linear-gradient(135deg, #fed7d3 0%, #fbbf24 100%);
            transform: translateY(-2px);
            box-shadow: 0 6px 12px rgba(245, 158, 11, 0.2);
            border-color: #d97706;
        }

        .cb-option[data-action="claude-opinion"]:active {
            transform: translateY(0);
            background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
            box-shadow: 0 2px 4px rgba(245, 158, 11, 0.1);
        }

        /* Action icon styling */
        .cb-action-icon {
            background: #10a37f;
            color: white;
            padding: 6px 10px;
            border-radius: 50%;
            font-size: 12px;
            font-weight: bold;
            transition: all 0.2s ease;
        }

        .cb-option[data-action="all-context"]:hover .cb-action-icon {
            background: #0d9f6b;
            transform: translateX(2px);
        }

        .cb-option[data-action="claude-opinion"] .cb-action-icon {
            background: #f59e0b;
            color: white;
        }

        .cb-option[data-action="claude-opinion"]:hover .cb-action-icon {
            background: #d97706;
            transform: translateX(2px);
        }
        
        /* Coming soon options */
        .cb-disabled {
            opacity: 0.7;
            cursor: not-allowed;
        }
        
        .cb-disabled:hover {
            background: #f9fafb;
            transform: translateX(2px);
        }
        
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
        
        /* Animation for dropdown arrow */
        .context-bridge-dropdown.open .cb-arrow {
            transform: rotate(180deg);
        }
        
        /* Responsive design */
        @media (max-width: 480px) {
            .cb-dropdown-menu {
                min-width: 260px;
                right: -10px;
            }
        }
    `;
    document.head.appendChild(style);
}

// Event handlers for the dropdown
function setupDropdownEvents(container) {
    const button = container.querySelector('#cb-main-button');
    const menu = container.querySelector('#cb-menu');
    const allContextOption = container.querySelector('[data-action="all-context"]');
    const claudeOption = container.querySelector('[data-action="claude-opinion"]');
    const dropdown = container.querySelector('.context-bridge-dropdown');

    if (!button || !menu || !allContextOption) {
        console.error('Dropdown elements not found');
        return;
    }

    // Toggle dropdown
    button.addEventListener('click', (e) => {
        e.stopPropagation();
        
        if (menu.style.display === 'none' || !menu.style.display) {
            menu.style.display = 'block';
            dropdown.classList.add('open');
            requestAnimationFrame(() => {
                menu.classList.add('show');
            });
        } else {
            menu.classList.remove('show');
            dropdown.classList.remove('open');
            setTimeout(() => {
                menu.style.display = 'none';
            }, 200);
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            menu.classList.remove('show');
            dropdown.classList.remove('open');
            setTimeout(() => {
                menu.style.display = 'none';
            }, 200);
        }
    });

    // Working feature - Summarize and Continue
    allContextOption.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Close dropdown
        menu.classList.remove('show');
        dropdown.classList.remove('open');
        setTimeout(() => {
            menu.style.display = 'none';
        }, 200);

        // Add loading state
        const originalContent = button.innerHTML;
        button.innerHTML = '<span>Processing...</span>';
        button.disabled = true;

        // Call your existing function
        summarizeLastMessage();

        // Reset button after delay
        setTimeout(() => {
            button.innerHTML = originalContent;
            button.disabled = false;
        }, 3000);
    });

    // Claude Opinion feature
    if (claudeOption) {
        claudeOption.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Close dropdown
            menu.classList.remove('show');
            dropdown.classList.remove('open');
            setTimeout(() => {
                menu.style.display = 'none';
            }, 200);

            // Add loading state
            const originalContent = button.innerHTML;
            button.innerHTML = '<span>Opening Claude...</span>';
            button.disabled = true;

            // Call Claude function
            askClaudeOpinion();

            // Reset button after delay
            setTimeout(() => {
                button.innerHTML = originalContent;
                button.disabled = false;
            }, 2000);
        });
    }

    // Coming soon features
    const comingSoonOptions = container.querySelectorAll('.cb-disabled');
    comingSoonOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const featureName = option.querySelector('span').textContent;
            showNotification(`🚀 "${featureName}" coming soon! Star our GitHub to get notified.`);
        });
    });
}

// Notification system
function showNotification(message) {
    // Remove existing notifications
    const existing = document.querySelectorAll('.cb-notification');
    existing.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = 'cb-notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1f2937;
        color: white;
        padding: 12px 18px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        opacity: 0;
        transform: translateY(-20px);
        transition: all 0.3s ease;
        max-width: 300px;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    });

    // Remove after 4 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// Extract full conversation for Claude
function extractFullConversation() {
    const articles = [...document.querySelectorAll("article")];
    let conversation = "";
    
    articles.forEach(article => {
        const userMessage = article.querySelector("h5")?.textContent?.includes("You said:");
        const gptMessage = article.querySelector("h6")?.textContent?.includes("ChatGPT said:");
        
        if (userMessage) {
            const content = article.querySelector("p")?.innerText || "";
            if (content.trim()) {
                conversation += `\n\nUser: ${content.trim()}`;
            }
        } else if (gptMessage) {
            const content = article.querySelector("p[data-start][data-end]")?.innerText || "";
            if (content.trim()) {
                conversation += `\n\nChatGPT: ${content.trim()}`;
            }
        }
    });
    console.log("Summary extracted", conversation)
    
    return conversation.trim();
}

// Refactored askClaudeOpinion to accept a param and use the new flow
async function askClaudeOpinion() {
    const promptText = `\nPlease create a comprehensive summary of our entire conversation that I can share with Claude AI to get a second opinion. Include:\n\n- The main topic and goals we discussed\n- Key questions I asked and your responses  \n- Important recommendations and solutions you provided\n- Current status and any next steps we identified\n- Full context that would help another AI understand our discussion\n\nBe thorough but clear - this summary will be shared with Claude to get their perspective on our conversation and approach.\n\nFormat as a single, well-structured paragraph optimized for immediate context understanding.`;

    // Find the main input (now a <p> inside #prompt-textarea)
    const inputP = document.querySelector('#prompt-textarea > p');
    if (!inputP) {
        showNotification("❌ Could not find ChatGPT input box.");
        return;
    }

    // Set the value (for <p>, use innerText)
    inputP.innerText = promptText;
    inputP.dispatchEvent(new Event('input', { bubbles: true }));

    // Set pendingSummaryType BEFORE polling loop
    pendingSummaryType = 'claude';
    console.log("Set pendingSummaryType to", pendingSummaryType);

    // Wait for the send button to appear and be enabled, then click
    let attempts = 0;
    const maxAttempts = 30; // Try for up to 3 seconds
    const interval = setInterval(() => {
        let sendButton =
            document.querySelector('#composer-submit-button') ||
            document.querySelector('button[aria-label="Send prompt"]') ||
            document.querySelector('button[data-testid="send-button"]');
        if (sendButton && !sendButton.disabled) {
            sendButton.click();
            // Get the current tabId and enable the listener for this tab
            chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
                if (response && response.tabId) {
                    chrome.runtime.sendMessage({ action: "enableListener", tabId: response.tabId });
                }
            });
            clearInterval(interval);
        } else if (++attempts > maxAttempts) {
            showNotification("❌ Could not find or enable ChatGPT send button.");
            clearInterval(interval);
        }
    }, 100);
}

let pendingSummaryType = null;

chrome.runtime.onMessage.addListener(function handler(message, sender, sendResponse) {
    console.log("Received message in content script:", message, "pendingSummaryType:", pendingSummaryType);
    if (message.event === "conversation_completed" && pendingSummaryType) {
        // Extract the last ChatGPT reply
        const articles = [...document.querySelectorAll("article")];
        const chatGPTReplies = articles.filter(article =>
            article.querySelector("h6")?.textContent.trim() === "ChatGPT said:"
        );
        const lastReply = chatGPTReplies[chatGPTReplies.length - 1];
        if (!lastReply) return alert("❌ No ChatGPT reply found");
        const replyParagraph = lastReply.querySelector("p[data-start][data-end]");
        if (!replyParagraph) return alert("❌ Reply text not found");
        const replyText = replyParagraph.innerText.trim();
        if (!replyText) return alert("❌ Reply text is empty");

        if (pendingSummaryType === 'claude') {
            console.log("Opening Claude with summary:", replyText);
            openLastChatGPTReply('claude', replyText);
        } else {
            console.log("Opening ChatGPT with summary:", replyText);
            openLastChatGPTReply('chatgpt', replyText);
        }
        pendingSummaryType = null;
    }
});

async function summarizeLastMessage(options = {}) {
    const { summaryType = 'continue', customPrompt = null } = options;
    pendingSummaryType = summaryType;
    const articles = [...document.querySelectorAll("article")];
    const userMessages = articles.filter(article =>
        article.querySelector("h5")?.textContent.trim() === "You said:"
    );

    const lastUserMessage = userMessages[userMessages.length - 1];
    if (!lastUserMessage) return alert("❌ No user message found");

    const editButton = lastUserMessage.querySelector('button[aria-label="Edit message"]');
    if (!editButton) return alert("❌ Edit button not found");
    editButton.click();

    await new Promise(r => setTimeout(r, 500));

    const textarea = lastUserMessage.querySelector("textarea");
    if (!textarea) return alert("❌ Editable textarea not found");

    let prompt = '';
    if (customPrompt) {
        prompt = customPrompt;
    } else if (summaryType === 'claude') {
        prompt = `\nPlease create a comprehensive summary of our entire conversation that I can share with Claude AI to get a second opinion. Include:\n\n- The main topic and goals we discussed\n- Key questions I asked and your responses  \n- Important recommendations and solutions you provided\n- Current status and any next steps we identified\n- Full context that would help another AI understand our discussion\n\nBe thorough but clear - this summary will be shared with Claude to get their perspective on our conversation and approach.\n\nFormat as a single, well-structured paragraph optimized for immediate context understanding.`;
    } else {
        prompt = `You will receive this summary as the first message in a new conversation to continue seamlessly. Please condense this conversation into a focused, context-rich summary of no more than 100 words.\n\nInclude ONLY the essential information needed to continue productively:\n• Current topic/objective and your role\n• Key decisions made and problems solved  \n• Current state/progress and immediate next steps\n• Any specific requirements, constraints, or preferences established\n\nFormat as a single, well-structured paragraph optimized for immediate context understanding.`;
    }

    textarea.value = prompt;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise(r => setTimeout(r, 300));
    const sendButton = document.querySelector('button.btn.btn-primary');
    // Before clicking the send button, get the tabId and enable the listener for this tab
    chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
        if (response && response.tabId) {
            chrome.runtime.sendMessage({ action: "enableListener", tabId: response.tabId });
        }
    });
    sendButton?.click();
    console.log("Button clicked At: ", new Date().toISOString());
}

// Refactored openLastChatGPTReply to accept destination and message
async function openLastChatGPTReply(destination = 'chatgpt', message = '') {
    console.log("openLastChatGPTReply called with:", destination, message);
    if (!message) {
        // fallback: extract last ChatGPT reply as before
        const articles = [...document.querySelectorAll("article")];
        const chatGPTReplies = articles.filter(article =>
            article.querySelector("h6")?.textContent.trim() === "ChatGPT said:"
        );
        const lastReply = chatGPTReplies[chatGPTReplies.length - 1];
        if (!lastReply) return alert("❌ No ChatGPT reply found");
        const replyParagraph = lastReply.querySelector("p[data-start][data-end]");
        if (!replyParagraph) return alert("❌ Reply text not found");
        message = replyParagraph.innerText.trim();
        if (!message) return alert("❌ Reply text is empty");
    }

    if (destination === 'claude') {
        const contextForClaude = `I'm sharing a summary of my conversation with ChatGPT. Please review it and provide your perspective, suggestions, or corrections as another AI assistant.\n\nSummary:\n${message}`;
        const url = `https://claude.ai/new?q=${encodeURIComponent(contextForClaude)}`;
        showNotification("🚀 Sending summary to Claude...")
        setTimeout(() => {
            window.open(url, "_blank");
            showNotification("🚀 Sent summary to Claude...")
        }, 2000); // Wait for 2 seconds
    } else {
        const query = encodeURIComponent(message);
        const url = `https://chatgpt.com/?q=${query}`;
        window.open(url, "_blank");
    }
}

// Initialize the extension
createFloatingButton();