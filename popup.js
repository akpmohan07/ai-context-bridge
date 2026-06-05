const toggle = document.getElementById('soundsEnabled');

chrome.storage.sync.get({ soundsEnabled: false }, (result) => {
  toggle.checked = result.soundsEnabled;
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ soundsEnabled: toggle.checked });
});
