class PresenceLayer {
  constructor() {
    this._triggers = [
      new SentTrigger(),
      new StopButtonTrigger(),
    ];
    this._sm = new PresenceStateMachine(this._onTransition.bind(this));
    this._enabled = true;
  }

  init() {
    this._triggers.forEach(t => t.attach(event => this._sm.handle(event)));
    console.log('[AI Presence] initialized');
  }

  destroy() {
    this._triggers.forEach(t => t.detach());
    this._sm.destroy();
  }

  setEnabled(val) {
    this._enabled = val;
    if (!val) soundRegistry.stop('hum'); // kill any looping sound immediately
  }

  setVolume(vol) {
    soundRegistry.setVolume(vol);
  }

  _onTransition(state) {
    console.log(`[AI Presence] state: ${state}`);
    if (!this._enabled) return;

    const cfg = PRESENCE_CONFIG[state];
    if (!cfg) return;
    if (cfg.stop) soundRegistry.stop(cfg.stop);
    if (cfg.play) soundRegistry.play(cfg.play);
  }
}
