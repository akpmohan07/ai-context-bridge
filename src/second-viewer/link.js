// Background side of the Second Viewer link: one WebSocket to the Second Viewer server on
// this Mac. The server sends {id, method, params}; we answer {id, result} or {id, error}.
// The socket stays quiet except for a ping every 20 s (that ping is what keeps an MV3
// service worker alive), and closes itself when no YouTube tab is open.

const SERVER = 'ws://127.0.0.1:8781';
const YOUTUBE_TABS = { url: 'https://www.youtube.com/*' };

let ws = null;
let pinger = null;

// Content scripts only reach pages loaded after the extension was installed or reloaded.
// A YouTube tab that was already open has none, so put them in on first contact.
async function injectYouTubeScripts(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/youtube-main.js'], world: 'MAIN' });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/youtube.js'] });
}

async function askTab(tabId, method, params) {
  try {
    return await chrome.tabs.sendMessage(tabId, { sv: method, params });
  } catch (e) {
    if (!/Receiving end does not exist|Could not establish connection/i.test(String(e?.message))) throw e;
    await injectYouTubeScripts(tabId);
    return chrome.tabs.sendMessage(tabId, { sv: method, params });
  }
}

function sendToTab(tabId, method, timeoutMs, params) {
  return Promise.race([
    askTab(tabId, method, params).then((r) => {
      if (!r) throw new Error('no answer from the YouTube tab (reload it?)');
      if (r.error) throw new Error(r.error);
      return r.result;
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${method} timed out`)), timeoutMs)),
  ]);
}

async function listTabs() {
  const tabs = await chrome.tabs.query(YOUTUBE_TABS);
  const out = [];
  await Promise.all(
    tabs.map(async (tab) => {
      try {
        const s = await sendToTab(tab.id, 'status', 2500);
        if (s?.videoId) out.push({ tabId: tab.id, ...s, front: tab.active && s.visible });
      } catch {
        // tab without our content script (opened before install) or busy
      }
    }),
  );
  return out;
}

const TIMEOUTS = { status: 2000, pause: 2000, play: 2000, seek: 2000, frame: 4000, context: 25000 };

async function handle(msg) {
  const { id, method, params = {} } = msg;
  if (id === undefined) return;
  let reply;
  try {
    const result = method === 'list' ? await listTabs() : await sendToTab(params.tabId, method, TIMEOUTS[method] ?? 3000, params);
    reply = { id, result };
  } catch (e) {
    reply = { id, error: String(e?.message || e) };
  }
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(reply));
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const socket = new WebSocket(SERVER);
  ws = socket;
  socket.onopen = () => {
    clearInterval(pinger);
    pinger = setInterval(async () => {
      if ((await chrome.tabs.query(YOUTUBE_TABS)).length === 0) {
        socket.close(); // nothing to watch: let the worker sleep
        return;
      }
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}');
    }, 20_000);
  };
  socket.onmessage = (e) => handle(JSON.parse(e.data));
  socket.onclose = () => {
    if (ws === socket) ws = null;
    clearInterval(pinger);
  };
  socket.onerror = () => {}; // server not running; the next hello from a YouTube tab retries
}

export function startSecondViewerLink() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.svHello) connect();
  });
  chrome.tabs.query(YOUTUBE_TABS).then((tabs) => tabs.length && connect());
}
