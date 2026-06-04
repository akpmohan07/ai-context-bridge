const claude = new ClaudePlatform();
claude.injectUI();

const presence = new PresenceLayer();
presence.init();

MessageTimer.init();
