// Maps each state → which sound to play and which to stop
// To add a new sound to a state: register it in sounds/ and reference it here
const PRESENCE_CONFIG = {
  SENT:       { play: 'breath', stop: null },
  GENERATING: { play: 'hum',    stop: null },
  REPLIED:    { play: 'chime',  stop: 'hum' },
  IDLE:       { play: null,     stop: null },
};
