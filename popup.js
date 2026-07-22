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
                : Theme.copy.accent;
    el.style.borderLeftColor = color;
});

const DEFAULTS = {
  soundsEnabled:  false,
  timerEnabled:   true,
  chatgptEnabled: true,
  redditEnabled:  true,
  mediumEnabled:  true,
};

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

// 'none' means don't manage the model — leave Claude.ai's own default alone.
// Must match the fallback in ClaudePlatform.openWithContext(), or the popup
// shows a selection that was never saved.
const MODEL_DEFAULT = 'none';
const modelSelect = document.getElementById('preferredClaudeModel');

(async () => {
  // Rebuild options from the live catalog cached by claude-content-script.js.
  // Until that exists (fresh install, no claude.ai visit yet) popup.html's
  // disabled placeholder stands — clearing innerHTML drops it here, so the
  // 'Default' sentinel has to be re-added by hand since the catalog has no
  // entry of its own for it.
  const { availableClaudeModels } = await chrome.storage.local.get({ availableClaudeModels: null });
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

  const { preferredClaudeModel } = await chrome.storage.sync.get({ preferredClaudeModel: MODEL_DEFAULT });
  modelSelect.value = preferredClaudeModel;
})();

modelSelect.addEventListener('change', (e) => {
  chrome.storage.sync.set({ preferredClaudeModel: e.target.value });
});
