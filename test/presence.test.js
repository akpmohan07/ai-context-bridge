import { describe, it, expect, vi, afterEach } from 'vitest';
import { PresenceLayer } from '../src/presence/presence.js';
import { soundRegistry } from '../src/presence/sounds/registry.js';
import { PRESENCE_CONFIG } from '../src/presence/config.js';

// The soundsEnabled toggle gates one line — `if (!this._enabled) return` in
// _onTransition, before soundRegistry.play(). It can't be checked end-to-end:
// the AudioContext is created in the content script's isolated world, which a
// page-context probe (Playwright addInitScript) can't see. So it lives here.

describe('PresenceLayer — soundsEnabled gate', () => {
  afterEach(() => vi.restoreAllMocks());

  it('disabled: a state transition plays nothing', () => {
    const play = vi.spyOn(soundRegistry, 'play').mockImplementation(() => {});
    const p = new PresenceLayer();
    p.setEnabled(false);
    p._onTransition('SENT');
    p._onTransition('GENERATING');
    p._onTransition('REPLIED');
    expect(play).not.toHaveBeenCalled();
  });

  it('enabled: each state plays its configured sound', () => {
    const play = vi.spyOn(soundRegistry, 'play').mockImplementation(() => {});
    const stop = vi.spyOn(soundRegistry, 'stop').mockImplementation(() => {});
    const p = new PresenceLayer();
    p.setEnabled(true);

    p._onTransition('SENT');
    expect(play).toHaveBeenLastCalledWith(PRESENCE_CONFIG.SENT.play); // 'breath'
    p._onTransition('REPLIED');
    expect(play).toHaveBeenLastCalledWith(PRESENCE_CONFIG.REPLIED.play); // 'chime'
    expect(stop).toHaveBeenCalledWith(PRESENCE_CONFIG.REPLIED.stop); // 'hum'
  });

  it('setEnabled(false) stops a looping sound immediately', () => {
    const stop = vi.spyOn(soundRegistry, 'stop').mockImplementation(() => {});
    new PresenceLayer().setEnabled(false);
    expect(stop).toHaveBeenCalledWith('hum');
  });
});
