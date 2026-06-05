const claude = new ClaudePlatform();
claude.injectUI();

const presence = new PresenceLayer();
presence.init();

chrome.storage.sync.get({ soundsEnabled: false, timerEnabled: true }, (result) => {
  presence.setEnabled(result.soundsEnabled);
  MessageTimer.setEnabled(result.timerEnabled);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.soundsEnabled !== undefined) presence.setEnabled(changes.soundsEnabled.newValue);
  if (changes.timerEnabled !== undefined) MessageTimer.setEnabled(changes.timerEnabled.newValue);
});

MessageTimer.init();
