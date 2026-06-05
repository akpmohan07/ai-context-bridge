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
