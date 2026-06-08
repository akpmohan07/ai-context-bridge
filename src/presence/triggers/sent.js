class SentTrigger extends BaseTrigger {
  constructor() {
    super();
    this._clickHandler = null;
    this._keyHandler = null;
  }

  attach(callback) {
    super.attach(callback);
    this._clickHandler = (e) => {
      if (e.target.closest('button[aria-label="Send message"]')) {
        this._emit('sent');
      }
    };
    this._keyHandler = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && e.target.closest('div[contenteditable="true"]')) {
        this._emit('sent');
      }
    };
    document.addEventListener('click', this._clickHandler, true);
    document.addEventListener('keydown', this._keyHandler, true);
  }

  detach() {
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler, true);
      this._clickHandler = null;
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler, true);
      this._keyHandler = null;
    }
    super.detach();
  }
}
