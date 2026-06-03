class BaseTrigger {
  constructor() {
    this._callback = null;
  }

  // callback receives an event string e.g. 'sent', 'stop-appeared', 'stop-disappeared'
  attach(callback) {
    this._callback = callback;
  }

  detach() {
    this._callback = null;
  }

  _emit(event) {
    if (this._callback) this._callback(event);
  }
}
