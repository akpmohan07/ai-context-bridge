export default defineBackground(() => {
  // v1.x had one shared `timerEnabled` for Time Awareness; v3 splits it per
  // platform. On update, carry the old value into all three so anyone who
  // turned it off keeps it off. No schema-version framework — one targeted
  // step (see docs/tech-backlog.md § storage keys).
  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason !== 'update') return;
    const { timerEnabled } = await chrome.storage.sync.get('timerEnabled');
    if (timerEnabled === undefined) return; // fresh key set or already migrated
    await chrome.storage.sync.set({
      claudeTimerEnabled: timerEnabled,
      chatgptTimerEnabled: timerEnabled,
      geminiTimerEnabled: timerEnabled,
    });
    await chrome.storage.sync.remove('timerEnabled');
    console.log('[ACB] migrated timerEnabled →', timerEnabled);
  });

  let listeningTabId = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "enableListener") {
      listeningTabId = message.tabId;
      console.log("[ACB] Background: enableListener received for tabId:", listeningTabId);
    }
    if (message.action === "getTabId") {
      sendResponse({ tabId: sender.tab.id });
    }
  });

  // Signal the armed tab when a ChatGPT summarize reply finishes streaming.
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      if (listeningTabId !== null) {
        chrome.tabs.get(listeningTabId, (tab) => {
          if (tab && tab.url && tab.url.startsWith("https://chatgpt.com/")) {
            chrome.tabs.sendMessage(listeningTabId, { event: "conversation_completed" });
            console.log("[ACB] Sent 'conversation_completed' to tab:", listeningTabId, tab.url);
          } else {
            console.log("[ACB] Tab not found or not a ChatGPT page:", listeningTabId, tab ? tab.url : "no tab");
          }
          listeningTabId = null;
        });
      }
    },
    { urls: ["https://chatgpt.com/backend-api/f/conversation"] }
  );
});
