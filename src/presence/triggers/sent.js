class SentTrigger extends BaseTrigger {
  constructor() {
    super();
    this._handler = null;
  }

  attach(callback) {
    super.attach(callback);
    this._handler = (e) => {
      if (e.target.closest('button[aria-label="Send message"]')) {
        this._emit('sent');
      }
    };
    document.addEventListener('click', this._handler, true);
  }

  detach() {
    if (this._handler) {
      document.removeEventListener('click', this._handler, true);
      this._handler = null;
    }
    super.detach();
  }
}
