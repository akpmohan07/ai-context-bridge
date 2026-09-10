import { Defaults } from '../../src/core/defaults.js';
import { Theme } from '../../src/ui/theme.js';

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

// Apply theme tokens as CSS variables
const root = document.documentElement;
root.style.setProperty('--popup-bg',           Theme.popup.bg);
root.style.setProperty('--popup-header-bg',    Theme.popup.headerBg);
root.style.setProperty('--popup-border',       Theme.popup.border);
root.style.setProperty('--popup-section-label',Theme.popup.sectionLabel);
root.style.setProperty('--popup-slider-off',   Theme.popup.sliderOff);
root.style.setProperty('--popup-slider-on',    Theme.popup.sliderOn);
root.style.setProperty('--popup-text',         Theme.ui.text);
root.style.setProperty('--popup-text-weak',    Theme.ui.textWeak);
root.style.setProperty('--popup-icon-bg',      '#ffffff');

// Section accent colors per platform
document.querySelectorAll('.section').forEach(el => {
    const color = { claude: Theme.claude.accent, chatgpt: Theme.chatgpt.accent, gemini: Theme.gemini.accent }[el.dataset.accent];
    if (color) el.style.setProperty('--accent', color); // "Sources" keeps the muted grey
});

// Put the section for the tab you're on first (chatgpt.com → ChatGPT on top).
// Sources otherwise stays last.
(async () => {
    const body = document.querySelector('.body');
    const order = ['claude', 'chatgpt', 'gemini', 'sources'];
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const host = tab?.url ? new URL(tab.url).hostname : '';
        const top = host.endsWith('claude.ai') ? 'claude'
                  : host.endsWith('chatgpt.com') ? 'chatgpt'
                  : host.endsWith('gemini.google.com') ? 'gemini'
                  : (host.endsWith('reddit.com') || host.endsWith('medium.com')) ? 'sources'
                  : null;
        if (top) order.unshift(...order.splice(order.indexOf(top), 1));
    } catch { /* no tabs permission / no active tab — default order */ }
    for (const s of order) body.appendChild(body.querySelector(`[data-section="${s}"]`));
})();

// Which toggles this popup renders — each id is both the storage key and the
// checkbox's element id. Defaults come from src/core/defaults.js.
const TOGGLES = [
    'redditEnabled', 'mediumEnabled',
    'claudeTimerEnabled', 'soundsEnabled',
    'chatgptTimerEnabled', 'chatgptEnabled',
    'geminiTimerEnabled',
];
const DEFAULTS = Object.fromEntries(TOGGLES.map(k => [k, Defaults[k]]));

chrome.storage.sync.get(DEFAULTS, (result) => {
  for (const key of Object.keys(DEFAULTS)) {
    document.getElementById(key).checked = result[key];
  }
});

for (const key of Object.keys(DEFAULTS)) {
  document.getElementById(key).addEventListener('change', (e) => {
    chrome.storage.sync.set({ [key]: e.target.checked });
  });
}

const modelSelect = document.getElementById('preferredClaudeModel');

(async () => {
  // Rebuild options from the live catalog cached by the claude content script.
  const { availableClaudeModels } = await chrome.storage.local.get({
    availableClaudeModels: Defaults.availableClaudeModels
  });
  if (availableClaudeModels?.length) {
    modelSelect.innerHTML = '';
    const noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = 'Default';
    modelSelect.appendChild(noneOption);
    for (const model of availableClaudeModels) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      option.disabled = !!model.disabled_reason;
      modelSelect.appendChild(option);
    }
  }

  const { preferredClaudeModel } = await chrome.storage.sync.get({
    preferredClaudeModel: Defaults.preferredClaudeModel
  });
  modelSelect.value = preferredClaudeModel;
})();

modelSelect.addEventListener('change', (e) => {
  chrome.storage.sync.set({ preferredClaudeModel: e.target.value });
});
