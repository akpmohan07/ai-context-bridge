class SoundRegistry {
  constructor() {
    this._sounds = new Map();
    this._ctx = null;
    this._volume = 0.5;
    this._stoppers = new Map();
  }

  register(name, fn) {
    this._sounds.set(name, fn);
  }

  setVolume(vol) {
    this._volume = Math.max(0, Math.min(1, vol));
  }

  play(name) {
    const fn = this._sounds.get(name);
    if (!fn) return;
    const ctx = this._getContext();
    if (!ctx) return;
    const stopper = fn(ctx, this._volume);
    if (stopper) this._stoppers.set(name, stopper);
  }

  stop(name) {
    const stopper = this._stoppers.get(name);
    if (stopper) {
      stopper();
      this._stoppers.delete(name);
    }
  }

  _getContext() {
    try {
      if (!this._ctx) this._ctx = new AudioContext();
      if (this._ctx.state === 'suspended') this._ctx.resume();
      return this._ctx;
    } catch (e) {
      console.warn('[AI Presence] AudioContext unavailable', e);
      return null;
    }
  }
}

const soundRegistry = new SoundRegistry();
