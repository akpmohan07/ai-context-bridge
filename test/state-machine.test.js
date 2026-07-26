import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresenceStateMachine, PRESENCE_STATES } from '../src/presence/state-machine.js';

describe('PresenceStateMachine transitions', () => {
  it('starts IDLE', () => {
    const m = new PresenceStateMachine(() => {});
    expect(m.state).toBe(PRESENCE_STATES.IDLE);
  });

  it('walks IDLE → SENT → GENERATING → REPLIED', () => {
    const m = new PresenceStateMachine(() => {});
    m.handle('sent');            expect(m.state).toBe('SENT');
    m.handle('stop-appeared');   expect(m.state).toBe('GENERATING');
    m.handle('stop-disappeared'); expect(m.state).toBe('REPLIED');
  });

  it('fires onTransition with (next, prev)', () => {
    const cb = vi.fn();
    const m = new PresenceStateMachine(cb);
    m.handle('sent');
    expect(cb).toHaveBeenCalledWith('SENT', 'IDLE');
  });

  it('ignores invalid events for the current state', () => {
    const cb = vi.fn();
    const m = new PresenceStateMachine(cb);
    m.handle('stop-disappeared'); // not valid from IDLE
    expect(m.state).toBe(PRESENCE_STATES.IDLE);
    expect(cb).not.toHaveBeenCalled();
  });

  it('does not re-fire when the event maps to the same state', () => {
    const cb = vi.fn();
    const m = new PresenceStateMachine(cb);
    m.handle('sent');   // IDLE → SENT (1 call)
    m.handle('sent');   // SENT → SENT (no-op)
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('PresenceStateMachine auto-reset', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('auto-resets to IDLE 2s after REPLIED', () => {
    const m = new PresenceStateMachine(() => {});
    m.handle('sent');
    m.handle('stop-appeared');
    m.handle('stop-disappeared'); // REPLIED
    expect(m.state).toBe('REPLIED');
    vi.advanceTimersByTime(2000);
    expect(m.state).toBe(PRESENCE_STATES.IDLE);
  });

  it('cancels the reset if a new message is sent before it fires', () => {
    const m = new PresenceStateMachine(() => {});
    m.handle('sent');
    m.handle('stop-appeared');
    m.handle('stop-disappeared'); // REPLIED, reset armed
    m.handle('sent');             // REPLIED → SENT, should cancel reset
    vi.advanceTimersByTime(5000);
    expect(m.state).toBe('SENT');
  });

  it('destroy() clears a pending reset timer', () => {
    const m = new PresenceStateMachine(() => {});
    m.handle('sent');
    m.handle('stop-appeared');
    m.handle('stop-disappeared');
    m.destroy();
    vi.advanceTimersByTime(5000);
    expect(m.state).toBe('REPLIED'); // no reset fired
  });
});
