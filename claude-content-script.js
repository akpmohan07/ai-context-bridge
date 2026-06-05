const claude = new ClaudePlatform();
claude.injectUI();

const presence = new PresenceLayer();
presence.init();

chrome.storage.sync.get({ soundsEnabled: false }, (result) => {
  presence.setEnabled(result.soundsEnabled);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.soundsEnabled !== undefined) {
    presence.setEnabled(changes.soundsEnabled.newValue);
  }
});

MessageTimer.init();
