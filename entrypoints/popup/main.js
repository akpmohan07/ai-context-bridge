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
document.querySelectorAll('.section-label').forEach(el => {
    const accent = el.dataset.accent;
    const color = accent === 'claude' ? Theme.claude.accent
                : accent === 'chatgpt' ? Theme.chatgpt.accent
                : accent === 'gemini' ? Theme.gemini.accent
                : Theme.copy.accent;
    el.style.borderLeftColor = color;
});

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
