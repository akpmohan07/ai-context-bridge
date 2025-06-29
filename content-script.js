console.log("Content script loaded at", new Date().toISOString());

function createFloatingButton() {
    const btn = document.createElement("button");
    btn.textContent = "Summarize & Continue";
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "9999",
      padding: "10px 16px",
      fontSize: "14px",
      backgroundColor: "#10a37f",
      color: "white",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
    });
    btn.addEventListener("click", summarizeLastMessage);
    document.body.appendChild(btn);
  }
  
  async function summarizeLastMessage() {
  
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
  
    textarea.value = "You will receive this summary as the first message in a new conversation so you can continue seamlessly. Please condense only the messages in this chat into a single, well-structured paragraph of no more than 100 words (or 2000 characters). Focus on the main objectives, key actions or decisions taken, challenges resolved, and the immediate next steps—everything required to fully preserve the context and resume the conversation accurately and efficiently.";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  
    await new Promise(r => setTimeout(r, 300));
    const sendButton = document.querySelector('button.btn.btn-primary');
    chrome.runtime.sendMessage({ action: "enableListener" });
    sendButton?.click();
    console.log("Button clicked At: ", new Date().toISOString());
  }



  async function openLastChatGPTReply() {
    console.log("openLastChatGPTReply")
    window.scrollTo(0, document.body.scrollHeight);
  
    const articles = [...document.querySelectorAll("article")];
    const chatGPTReplies = articles.filter(article =>
      article.querySelector("h6")?.textContent.trim() === "ChatGPT said:"
    );
  
    const lastReply = chatGPTReplies[chatGPTReplies.length - 1];
    if (!lastReply) return alert("❌ No ChatGPT reply found");
  
    // Find the <p> element with data-start and data-end
    const replyParagraph = lastReply.querySelector("p[data-start][data-end]");
    if (!replyParagraph) return alert("❌ Reply text not found");
  
    const replyText = replyParagraph.innerText.trim();
    if (!replyText) return alert("❌ Reply text is empty");
  
    // Encode and open in new tab
    var query = "This is a continuation of the previous chat. "+  encodeURIComponent(replyText);
    const url = `https://chatgpt.com/?q=${query}`;
    console.log(replyText)
    window.open(url, "_blank");
  }

  createFloatingButton();


  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.event === "conversation_completed") {
      console.log("Conversation API finished. You can proceed with next steps.");
  
      // Example: trigger your summarize function here
      openLastChatGPTReply();
  
      // Or do anything you want on API completion
    }
  });
  