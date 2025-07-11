let listeningTabId = null;

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
