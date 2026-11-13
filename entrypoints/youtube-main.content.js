import { videoContext } from '../src/second-viewer/youtube-captions.js';

// Second Viewer link, page side. Runs in YouTube's own JS world so it can read the player's
// caption tracks. The isolated content script (youtube.content.js) asks through DOM events;
// strings are used for the event detail because they cross worlds cleanly.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    if (window.__svMain) return; // injected again into a tab that already has it
    window.__svMain = true;
    document.addEventListener('sv-get-context', (e) => {
      const { req } = JSON.parse(e.detail || '{}');
      videoContext()
        .catch((err) => ({ error: String(err?.message || err) }))
        .then((result) => {
          document.dispatchEvent(new CustomEvent('sv-context', { detail: JSON.stringify({ req, result }) }));
        });
    });
  },
});
