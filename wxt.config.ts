import { defineConfig } from 'wxt';

// Manifest is generated from this config + each entrypoint's own options
// (matches / run_at live in the entrypoint files). version/name/description
// come from package.json unless overridden here.
export default defineConfig({
  manifest: {
    name: 'AI Context Bridge',
    description:
      "One click carries full context into your AI chat, no copy-paste, and adds what it's missing, like a sense of time, and more.",
    // scripting/activeTab were declared but never used — content scripts are
    // all statically registered via content_scripts matches (host_permissions
    // below), never dynamically injected. Confirmed via grep across src/,
    // entrypoints/, and the compiled build output: zero calls to
    // chrome.scripting.* anywhere. Unnecessary permissions risk store
    // rejection (Edge's submission form says so explicitly) and just scare
    // users at install for no reason.
    permissions: ['webRequest', 'tabs', 'storage'],
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
    // Firefox-only. `gecko.id` is left unset — AMO assigns one on first
    // upload. data_collection_permissions is required for any new AMO
    // listing since 2025-11-03; 'none' is accurate — see README § Privacy
    // (all processing is local, nothing is ever sent to a server).
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
});
