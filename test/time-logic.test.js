import { describe, it, expect } from 'vitest';
import { formatElapsed, buildPrefix, parseClaudeLastTime, parseChatgptLastTime } from '../src/time/time-logic.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatElapsed', () => {
  it('minutes only', () => expect(formatElapsed(5 * MIN)).toBe('5 min'));
  it('whole hours', () => expect(formatElapsed(2 * HOUR)).toBe('2h'));
  it('hours and minutes', () => expect(formatElapsed(2 * HOUR + 30 * MIN)).toBe('2h 30m'));
  it('one day, singular', () => expect(formatElapsed(DAY)).toBe('1 day'));
  it('multiple days, plural', () => expect(formatElapsed(2 * DAY)).toBe('2 days'));
  it('days and hours', () => expect(formatElapsed(DAY + 3 * HOUR)).toBe('1 day 3h'));
  it('sub-minute gaps read as words, not "0 min"', () => {
    expect(formatElapsed(40 * 1000)).toBe('less than a minute');
    expect(formatElapsed(0)).toBe('less than a minute');
  });
});

describe('buildPrefix', () => {
  const now = new Date('2026-07-24T18:00:00');

  it('adds "since last message" when the gap crosses the threshold', () => {
    const last = new Date(now - 2 * HOUR);
    const out = buildPrefix(last, now);
    expect(out).toContain('since last message');
    expect(out).toContain('2h');
  });

  it('crossing exactly at the 30-min threshold still injects', () => {
    const last = new Date(now - 30 * MIN);
    expect(buildPrefix(last, now)).toContain('since last message');
  });

  it('timestamp only when there is no prior message', () => {
    const out = buildPrefix(null, now);
    expect(out).toContain('[TimeContext:');
    expect(out).not.toContain('since last message');
  });

  it('returns null during an active chat (gap under threshold)', () => {
    const last = new Date(now - 10 * MIN);
    expect(buildPrefix(last, now)).toBeNull();
  });
});

describe('parseClaudeLastTime', () => {
  it('takes the latest message created_at', () => {
    const data = { chat_messages: [
      { created_at: '2026-07-13T03:12:00Z' },
      { created_at: '2026-07-24T17:17:52Z' },
    ]};
    expect(parseClaudeLastTime(data)).toBe(Date.parse('2026-07-24T17:17:52Z'));
  });

  it('falls back to conversation updated_at when there are no messages', () => {
    const data = { updated_at: '2026-07-24T17:17:52.858151Z' };
    expect(parseClaudeLastTime(data)).toBe(Date.parse('2026-07-24T17:17:52.858151Z'));
  });

  it('returns null for empty or missing data', () => {
    expect(parseClaudeLastTime({})).toBeNull();
    expect(parseClaudeLastTime(null)).toBeNull();
  });
});

describe('parseChatgptLastTime', () => {
  it('takes the max create_time and converts seconds to ms', () => {
    const data = { mapping: {
      a: { message: { create_time: 1000 } },
      b: { message: { create_time: 2000 } },
    }};
    expect(parseChatgptLastTime(data)).toBe(2000 * 1000);
  });

  it('returns null when mapping is missing or has no timestamps', () => {
    expect(parseChatgptLastTime({})).toBeNull();
    expect(parseChatgptLastTime({ mapping: { a: { message: {} } } })).toBeNull();
  });
});
