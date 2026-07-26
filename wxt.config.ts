import { defineConfig } from 'wxt';

// Manifest is generated from this config + each entrypoint's own options
// (matches / run_at live in the entrypoint files). version/name/description
// come from package.json unless overridden here.
export default defineConfig({
  manifest: {
    name: 'AI Context Bridge',
    description:
      'One click sends Reddit threads, Medium articles & ChatGPT conversations to Claude or ChatGPT. No copy-paste, full context preserved.',
    permissions: ['scripting', 'activeTab', 'webRequest', 'tabs', 'storage'],
    host_permissions: [
      'https://chatgpt.com/*',
      'https://www.reddit.com/*',
      'https://medium.com/*',
      'https://*.medium.com/*',
    ],
    action: {
      default_title: 'AI Context Bridge - Transfer context between AI platforms',
    },
    icons: {
      16: 'icons/16-icon.png',
      32: 'icons/32-icon.png',
      48: 'icons/48-icon.png',
      128: 'icons/128-icon.png',
    },
  },
});
