let shouldListen = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableListener") {
    shouldListen = true;
  }
});

chrome.webRequest.onCompleted.addListener(
  (details) => {
   
    if (!shouldListen) {
        console.log("Not an user Action, so skipping this event")
        return;
    }

    console.log("Conversation API completed:", details);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, { event: "conversation_completed" });
      }
    });

    shouldListen = false;
  },
  { urls: ["https://chatgpt.com/backend-api/f/conversation"] }
);
