class StopButtonTrigger extends BaseTrigger {
  constructor() {
    super();
    this._pollTimer = null;
    this._wasPresent = false;
  }

  attach(callback) {
    super.attach(callback);
    this._wasPresent = this._isVisible();
    this._pollTimer = setInterval(() => this._check(), 150);
  }

  detach() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    super.detach();
  }

  // getBoundingClientRect returns zero dimensions for hidden/display:none elements
  _isVisible() {
    const btn = document.querySelector('button[aria-label="Stop response"]');
    if (!btn) return false;
    const rect = btn.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  _check() {
    const present = this._isVisible();
    if (present && !this._wasPresent) {
      this._wasPresent = true;
      this._emit('stop-appeared');
    } else if (!present && this._wasPresent) {
      this._wasPresent = false;
      this._emit('stop-disappeared');
    }
  }
}
