// The YouTube player adapter for Second Viewer (isolated content script).
// The background worker forwards the Second Viewer server's requests here:
//   status | pause | play | seek | frame | context
// Nothing is sent anywhere until the server asks.

const video = () => document.querySelector('#movie_player video') || document.querySelector('video');

function videoId() {
  const path = /\/(shorts|embed|live)\/([^/?#]+)/.exec(location.pathname)?.[2];
  return path || new URLSearchParams(location.search).get('v') || null;
}

function status() {
  const v = video();
  const id = videoId();
  if (!v || !id) return { videoId: null };
  return {
    videoId: id,
    time: v.currentTime,
    duration: v.duration,
    playing: !v.paused && !v.ended,
    ad: !!document.querySelector('#movie_player.ad-showing'),
    title: document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, ''),
    visible: document.visibilityState === 'visible',
  };
}

function frame() {
  const v = video();
  if (!v || !v.videoWidth) return null;
  const w = Math.min(768, v.videoWidth);
  const h = Math.round((v.videoHeight * w) / v.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(v, 0, 0, w, h);
  try {
    return { jpeg: canvas.toDataURL('image/jpeg', 0.82).split(',')[1], time: v.currentTime };
  } catch {
    return null; // protected (DRM) video can't be drawn
  }
}

// Captions need YouTube's own player object, so the page-world script fetches them.
function context() {
  return new Promise((resolve) => {
    const req = Math.random().toString(36).slice(2);
    const onReply = (e) => {
      const msg = JSON.parse(e.detail || '{}');
      if (msg.req !== req) return;
      document.removeEventListener('sv-context', onReply);
      resolve(msg.result);
    };
    document.addEventListener('sv-context', onReply);
    document.dispatchEvent(new CustomEvent('sv-get-context', { detail: JSON.stringify({ req }) }));
  });
}

const handlers = {
  status: async () => status(),
  pause: async () => {
    video()?.pause();
    return status();
  },
  play: async () => {
    await video()?.play();
    return status();
  },
  seek: async ({ t } = {}) => {
    const v = video();
    if (v && Number.isFinite(t)) v.currentTime = Math.max(0, t);
    return status();
  },
  frame: async () => frame(),
  context: () => context(),
};

export function youtubeAdapter() {
  if (globalThis.__svAdapter) return; // injected again into a tab that already has it
  globalThis.__svAdapter = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const handler = msg && handlers[msg.sv];
    if (!handler) return undefined;
    handler(msg.params).then(
      (result) => sendResponse({ result }),
      (err) => sendResponse({ error: String(err?.message || err) }),
    );
    return true; // async response
  });

  // Wake the background worker so it (re)opens the link to Second Viewer. Repeats because
  // Chrome may stop the worker; this is local to the browser, nothing goes to the server.
  const hello = () => chrome.runtime.sendMessage({ svHello: true }).catch(() => {});
  hello();
  setInterval(hello, 20_000);
}
