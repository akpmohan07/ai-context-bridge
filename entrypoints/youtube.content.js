import { youtubeAdapter } from '../src/second-viewer/youtube-adapter.js';

// Second Viewer link: lets the Second Viewer app on this Mac pause YouTube, read the time,
// grab the frame and get the captions when you ask about a moment. Unpublished branch only.
export default defineContentScript({
  matches: ['https://www.youtube.com/*'],
  runAt: 'document_idle',
  main() {
    youtubeAdapter();
  },
});
