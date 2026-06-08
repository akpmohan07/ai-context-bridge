const PRESENCE_STATES = {
  IDLE:       'IDLE',
  SENT:       'SENT',
  GENERATING: 'GENERATING',
  REPLIED:    'REPLIED',
};

// Valid transitions: currentState → { event → nextState }
const TRANSITIONS = {
  IDLE:       { sent: PRESENCE_STATES.SENT },
  SENT:       { sent: PRESENCE_STATES.SENT, 'stop-appeared': PRESENCE_STATES.GENERATING },
  GENERATING: { 'stop-disappeared': PRESENCE_STATES.REPLIED },
  REPLIED:    { sent: PRESENCE_STATES.SENT, reset: PRESENCE_STATES.IDLE },
};

class PresenceStateMachine {
  constructor(onTransition) {
    this._state = PRESENCE_STATES.IDLE;
    this._onTransition = onTransition;
    this._resetTimer = null;
  }

  handle(event) {
    const next = TRANSITIONS[this._state]?.[event];
    if (!next || next === this._state) return;

    const prev = this._state;
    this._state = next;
    console.log(`[AI Presence] ${prev} → ${next}`);
    this._onTransition(next, prev);

    // Auto-reset to IDLE after REPLIED so we're ready for next message
    if (next === PRESENCE_STATES.REPLIED) {
      this._resetTimer = setTimeout(() => this.handle('reset'), 2000);
    }
    if (this._resetTimer && next === PRESENCE_STATES.SENT) {
      clearTimeout(this._resetTimer);
      this._resetTimer = null;
    }
  }

  get state() {
    return this._state;
  }

  destroy() {
    if (this._resetTimer) clearTimeout(this._resetTimer);
  }
}
