chrome.webRequest.onCompleted.addListener(
  (details) => {
    console.log("Conversation API completed:", details);

    // Send a message to the active tab content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { event: "conversation_completed" });
      }
    });
  },
  { urls: ["https://chatgpt.com/backend-api/f/conversation"] }
);
