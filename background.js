let listeningTabId = null;
let focusSessions = {};  // Store focus sessions by window ID

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableListener") {
    listeningTabId = message.tabId;
    console.log("Background: enableListener received for tabId:", listeningTabId);
  }
  if (message.action === "getTabId") {
    sendResponse({ tabId: sender.tab.id });
  }
});

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (listeningTabId !== null) {
      chrome.tabs.get(listeningTabId, (tab) => {
        if (tab && tab.url && tab.url.startsWith("https://chatgpt.com/")) {
          chrome.tabs.sendMessage(listeningTabId, { event: "conversation_completed" });
          console.log("Sent 'conversation_completed' to tab:", listeningTabId, tab.url);
        } else {
          console.log("Tab not found or not a ChatGPT page:", listeningTabId, tab ? tab.url : "no tab");
        }
        listeningTabId = null;
      });
    }
  },
  { urls: ["https://chatgpt.com/backend-api/f/conversation"] }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      chrome.storage.local.set({ focusEnabled: true });
    if (changeInfo.status === 'complete') {
        chrome.storage.local.get('focusEnabled', ({ focusEnabled }) => {

            console.log('Focus Enabled:', focusEnabled);
            if (focusEnabled) {
                // Send a message to the content scri
                 const currentWindow = chrome.windows.getCurrent();
                chrome.tabs.sendMessage(tabId, { action: 'runFocusCheck', windowId: currentWindow.id  });
            }
        });
    }
});


