// Maps each state → which sound to play and which to stop
const PRESENCE_CONFIG = {
  SENT:       { play: 'breath', stop: null },
  GENERATING: { play: 'hum',    stop: null },
  REPLIED:    { play: 'chime',  stop: 'hum' },
  IDLE:       { play: null,     stop: null },
};
