import { describe, it, expect } from 'vitest';
import {
  parseUsage, classifyFailure, selectOrgId, backoffMs, readingsKey, appendReading, localDayKey, applyReading,
  currentWeek, summarize, formatTimeLeft, usageView, weekStrip, formatShortDate, formatResetAt,
} from '../src/usage/claude-usage.js';

const HOUR = 60 * 60 * 1000;

// Trimmed from a real /api/organizations/{orgId}/usage response.
const api = (overrides = {}) => ({
  five_hour: { utilization: 14.0, resets_at: '2026-09-30T20:19:59.789507+00:00' },
  seven_day: { utilization: 30.0, resets_at: '2026-10-04T16:59:59.789532+00:00' },
  iguana_necktie: { utilization: 0.0, limit_dollars: 100 },
  limits: [
    { kind: 'session', percent: 14, resets_at: '2026-09-30T20:19:59.789507+00:00' },
    { kind: 'weekly_all', percent: 30, resets_at: '2026-10-04T16:59:59.789532+00:00' },
  ],
  seven_day_breakdown: {
    as_of: '2026-09-30T16:43:13.108367+00:00',
    window_started_at: '2026-09-27T16:59:59.789532+00:00',
  },
  ...overrides,
});

const WEEK1 = '2026-09-27T17:00:00.000Z';
const RESET1 = '2026-10-04T17:00:00.000Z';
const WEEK2 = RESET1;
const RESET2 = '2026-10-11T17:00:00.000Z';

const reading = (util, asOf, weekStart = WEEK1, weekReset = RESET1) =>
  ({ asOf, util, weekStart, weekReset });

describe('parseUsage', () => {
  it('reads the weekly window from a real response', () => {
    const r = parseUsage(api());
    expect(r.ok).toBe(true);
    expect(r.reading).toEqual({
      asOf: '2026-09-30T16:43:13.108Z',
      util: 30,
      weekStart: WEEK1,
      weekReset: RESET1,
    });
  });

  it('rounds microsecond jitter so the week key stays stable', () => {
    const a = parseUsage(api()).reading;
    const b = parseUsage(api({
      seven_day: { utilization: 31, resets_at: '2026-10-04T16:59:59.912000+00:00' },
      seven_day_breakdown: { as_of: '2026-09-30T17:00:00Z', window_started_at: '2026-09-27T17:00:00.101+00:00' },
    })).reading;
    expect(b.weekStart).toBe(a.weekStart);
    expect(b.weekReset).toBe(a.weekReset);
  });

  it('falls back to limits[] when seven_day is gone', () => {
    const r = parseUsage(api({ seven_day: null }));
    expect(r.ok).toBe(true);
    expect(r.reading.util).toBe(30);
    expect(r.reading.weekReset).toBe(RESET1);
  });

  it('derives week start from the reset when the breakdown is gone', () => {
    const now = new Date('2026-09-30T12:00:00Z');
    const r = parseUsage(api({ seven_day_breakdown: null }), now);
    expect(r.reading.weekStart).toBe(WEEK1);
    expect(r.reading.asOf).toBe(now.toISOString());
  });

  it('clamps overage above 100 so unused never goes negative', () => {
    expect(parseUsage(api({ seven_day: { utilization: 112, resets_at: '2026-10-04T16:59:59Z' } })).reading.util).toBe(100);
  });

  it('a plan without a weekly limit is its own state, not a broken format', () => {
    expect(parseUsage(api({ seven_day: null, limits: [{ kind: 'session', percent: 14 }] })))
      .toEqual({ ok: false, reason: 'no_weekly_limit' });
  });

  it('rejects responses without a usable weekly window', () => {
    expect(parseUsage({}).reason).toBe('broken');
    expect(parseUsage(api({ seven_day: { utilization: 30, resets_at: 'bad' } })).reason).toBe('broken');
    expect(parseUsage(null).ok).toBe(false);
    expect(parseUsage('<html>').ok).toBe(false);
    expect(parseUsage({}).ok).toBe(false);
    expect(parseUsage(api({ seven_day: { utilization: '30', resets_at: 'x' }, limits: [] })).ok).toBe(false);
    expect(parseUsage(api({ seven_day: { utilization: 30, resets_at: 'not a date' }, limits: [] })).ok).toBe(false);
  });
});

describe('classifyFailure', () => {
  const JSON_TYPE = 'application/json';
  // Real response from claude.ai when logged out.
  const loggedOut = { type: 'error', error: { type: 'permission_error', message: 'Invalid authorization',
    details: { error_visibility: 'user_facing', error_code: 'account_session_invalid' } } };

  it("Claude's session-invalid answer means logged out", () => {
    expect(classifyFailure(403, JSON_TYPE, loggedOut))
      .toEqual({ state: 'logged_out', error: { code: 403, detail: 'account_session_invalid' } });
    expect(classifyFailure(401, JSON_TYPE, null).state).toBe('logged_out');
  });

  it("Cloudflare's 403 HTML page is a transient error, not a logout", () => {
    expect(classifyFailure(403, 'text/html; charset=UTF-8', null))
      .toEqual({ state: 'error', error: { code: 403, detail: 'html' } });
  });

  it('other JSON 403s and server errors are transient', () => {
    const other = { error: { type: 'permission_error', details: { error_code: 'something_else' } } };
    expect(classifyFailure(403, JSON_TYPE, other).state).toBe('error');
    expect(classifyFailure(429, JSON_TYPE, null).state).toBe('error');
    expect(classifyFailure(500, null, null).state).toBe('error');
  });
});

describe('selectOrgId', () => {
  it('prefers the org that hosts chat', () => {
    const orgs = [{ uuid: 'api-only', capabilities: ['api'] }, { uuid: 'mine', capabilities: ['chat', 'claude_pro'] }];
    expect(selectOrgId(orgs)).toBe('mine');
  });
  it('falls back to the first org, and null for nothing usable', () => {
    expect(selectOrgId([{ uuid: 'a' }, { uuid: 'b' }])).toBe('a');
    expect(selectOrgId([])).toBeNull();
    expect(selectOrgId({ error: 'x' })).toBeNull();
  });
});

describe('backoffMs', () => {
  it('doubles from 5 min per failure, capped at 6h', () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(5 * 60000);
    expect(backoffMs(2)).toBe(10 * 60000);
    expect(backoffMs(4)).toBe(40 * 60000);
    expect(backoffMs(20)).toBe(6 * HOUR);
  });
});

describe('reading log', () => {
  it('one key per account-week', () => {
    expect(readingsKey('org', WEEK1)).toBe(`claudeReadings:org:${WEEK1}`);
  });

  it('appends compact [unixSeconds, util] pairs in time order', () => {
    let log = appendReading(undefined, reading(30, '2026-09-30T08:00:00Z'));
    log = appendReading(log, reading(31.5, '2026-09-30T08:05:00Z'));
    expect(log).toEqual([[Date.parse('2026-09-30T08:00:00Z') / 1000, 30], [Date.parse('2026-09-30T08:05:00Z') / 1000, 31.5]]);
  });

  it('drops out-of-order and same-second readings', () => {
    const log = appendReading(undefined, reading(30, '2026-09-30T08:05:00Z'));
    expect(appendReading(log, reading(29, '2026-09-30T08:00:00Z'))).toBe(log);
    expect(appendReading(log, reading(30, '2026-09-30T08:05:00.400Z'))).toBe(log);
  });
});

describe('applyReading', () => {
  const week = (s, start = WEEK1) => s.weeks[start];

  it('first ever capture creates the week but no daily usage (no baseline)', () => {
    const s = applyReading({}, reading(30, '2026-09-30T08:00:00Z'), '2026-09-30');
    expect(week(s)).toEqual({ weekReset: RESET1, used: 30, firstReadingAt: '2026-09-30T08:00:00Z', lastReadingAt: '2026-09-30T08:00:00Z', days: {} });
  });

  it('same week: the day accumulates the growth between captures', () => {
    let s = applyReading({}, reading(31, '2026-09-30T02:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(36, '2026-09-30T05:30:00Z'), '2026-09-30');
    s = applyReading(s, reading(44, '2026-09-30T09:30:00Z'), '2026-09-30');
    s = applyReading(s, reading(47, '2026-09-30T16:30:00Z'), '2026-09-30');
    expect(week(s).days).toEqual({ '2026-09-30': 16 });
    expect(week(s).used).toBe(47);
  });

  it('a new local day starts its own entry; the old one is left as is', () => {
    let s = applyReading({}, reading(30, '2026-09-30T08:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(35, '2026-09-30T12:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(38, '2026-10-01T04:00:00Z'), '2026-10-01');
    expect(week(s).days).toEqual({ '2026-09-30': 5, '2026-10-01': 3 });
  });

  it('no growth writes no day entry', () => {
    let s = applyReading({}, reading(30, '2026-09-30T08:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(30, '2026-09-30T08:15:00Z'), '2026-09-30');
    expect(week(s).days).toEqual({});
  });

  it('a mid-week limit reset (usage drops) counts as zero, not negative', () => {
    let s = applyReading({}, reading(40, '2026-09-30T08:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(5, '2026-09-30T09:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(8, '2026-09-30T10:00:00Z'), '2026-09-30');
    expect(week(s).days).toEqual({ '2026-09-30': 3 });
    expect(week(s).used).toBe(8);
  });

  it('the reset day is split between the two weeks it belongs to', () => {
    let s = applyReading({}, reading(49, '2026-10-04T10:00:00Z'), '2026-10-04');
    s = applyReading(s, reading(55, '2026-10-04T16:30:00Z'), '2026-10-04');
    s = applyReading(s, reading(2, '2026-10-04T17:15:00Z', WEEK2, RESET2), '2026-10-04');
    expect(week(s, WEEK1)).toMatchObject({ weekReset: RESET1, used: 55, lastReadingAt: '2026-10-04T16:30:00Z', days: { '2026-10-04': 6 } });
    expect(week(s, WEEK2)).toEqual({ weekReset: RESET2, used: 2, firstReadingAt: '2026-10-04T17:15:00Z', lastReadingAt: '2026-10-04T17:15:00Z', days: { '2026-10-04': 2 } });
  });

  it("a new week first seen long after its reset keeps that usage off any day", () => {
    let s = applyReading({}, reading(55, '2026-10-04T16:30:00Z'), '2026-10-04');
    s = applyReading(s, reading(20, '2026-10-06T09:00:00Z', WEEK2, RESET2), '2026-10-06');
    expect(week(s, WEEK2).days).toEqual({});
    expect(week(s, WEEK2).firstReadingAt).toBe('2026-10-06T09:00:00Z');
  });

  it('firstReadingAt stays put as the week goes on', () => {
    let s = applyReading({}, reading(30, '2026-09-30T08:00:00Z'), '2026-09-30');
    s = applyReading(s, reading(35, '2026-10-01T08:00:00Z'), '2026-10-01');
    expect(week(s).firstReadingAt).toBe('2026-09-30T08:00:00Z');
  });

  it('skipped weeks simply have no record', () => {
    let s = applyReading({}, reading(20, '2026-09-28T10:00:00Z'), '2026-09-28');
    const later = '2026-10-18T17:00:00.000Z';
    s = applyReading(s, reading(10, '2026-10-19T10:00:00Z', later, '2026-10-25T17:00:00.000Z'), '2026-10-19');
    expect(Object.keys(s.weeks)).toEqual([WEEK1, later]);
  });

  it('ignores a reading older than the stored one', () => {
    const before = applyReading({}, reading(40, '2026-09-30T10:00:00Z'), '2026-09-30');
    expect(applyReading(before, reading(35, '2026-09-30T09:00:00Z'), '2026-09-30')).toEqual(before);
  });

  it('does not mutate its input', () => {
    const s0 = applyReading({}, reading(30, '2026-09-30T08:00:00Z'), '2026-09-30');
    const snapshot = JSON.stringify(s0);
    applyReading(s0, reading(40, '2026-09-30T09:00:00Z'), '2026-09-30');
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it("a week's days add up to its growth since the first capture", () => {
    let s = {};
    const utils = [12, 12.5, 19, 19, 26.25, 31, 44, 47.75];
    utils.forEach((u, i) => {
      const asOf = new Date(Date.parse('2026-09-28T00:00:00Z') + i * 9 * HOUR).toISOString();
      s = applyReading(s, reading(u, asOf), asOf.slice(0, 10));
    });
    const sum = Object.values(week(s).days).reduce((a, d) => a + d, 0);
    expect(sum).toBeCloseTo(47.75 - 12, 5);
  });
});

describe('localDayKey', () => {
  it('formats the local calendar date', () => {
    expect(localDayKey(new Date(2026, 8, 30, 23, 59))).toBe('2026-09-30');
    expect(localDayKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});

describe('display', () => {
  it('currentWeek picks the week with the latest reset', () => {
    let s = applyReading({}, reading(55, '2026-10-04T16:30:00Z'), '2026-10-04');
    s = applyReading(s, reading(2, '2026-10-04T17:15:00Z', WEEK2, RESET2), '2026-10-04');
    expect(currentWeek(s.weeks)).toMatchObject({ weekStart: WEEK2, used: 2 });
    expect(currentWeek({})).toBeNull();
    expect(currentWeek(undefined)).toBeNull();
  });

  it('summarize gives unused % and time left', () => {
    const week = { weekReset: RESET1, used: 31 };
    const now = new Date(Date.parse(RESET1) - (3 * 24 + 22) * HOUR);
    expect(summarize(week, now)).toEqual({ unused: 69, msLeft: (3 * 24 + 22) * HOUR });
    expect(summarize(week, new Date('2026-10-05T00:00:00Z')).msLeft).toBe(0);
    expect(summarize(null)).toBeNull();
  });

  it('formatTimeLeft', () => {
    expect(formatTimeLeft((3 * 24 + 22) * HOUR)).toBe('3d 22h');
    expect(formatTimeLeft(5 * HOUR + 30 * 60000)).toBe('5h 30m');
    expect(formatTimeLeft(12 * 60000)).toBe('12m');
  });

});

describe('weekStrip', () => {
  // Local-time week starting Sat 26 Sep 22:30 so slots are Sun 27 … Sat 3 Oct.
  const start = new Date(2026, 8, 26, 22, 30);
  const wk = (extra) => ({
    weekStart: start.toISOString(),
    weekReset: new Date(2026, 9, 3, 22, 30).toISOString(),
    ...extra,
  });
  const wed = new Date(2026, 8, 30, 15, 0);

  it('seven slots Sun…Sat with past / today / future', () => {
    const { slots } = weekStrip(wk({ used: 0, firstReadingAt: start.toISOString(), days: {} }), wed);
    expect(slots.map(s => s.label)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(slots.map(s => s.when)).toEqual(['past', 'past', 'past', 'today', 'future', 'future', 'future']);
  });

  it('days before tracking began are untracked; their usage has no day', () => {
    const week = wk({ used: 32, firstReadingAt: new Date(2026, 8, 30, 9, 0).toISOString(), days: { '2026-09-30': 4 } });
    const { slots, untracked } = weekStrip(week, wed);
    expect(slots.slice(0, 4).map(s => s.used)).toEqual([null, null, null, 4]);
    expect(slots.slice(0, 3).every(s => s.untracked)).toBe(true);
    expect(untracked).toBe(28);
  });

  it('a tracked day with no usage is 0, not untracked', () => {
    const week = wk({ used: 9, firstReadingAt: start.toISOString(), days: { '2026-09-27': 5, '2026-09-29': 4 } });
    const { slots, untracked } = weekStrip(week, wed);
    expect(slots.slice(0, 4).map(s => s.used)).toEqual([5, 0, 4, 0]);
    expect(slots.some(s => s.untracked)).toBe(false);
    expect(untracked).toBe(0);
  });

  it('the sliver of the reset day before Sunday folds into the first slot', () => {
    const week = wk({ used: 3, firstReadingAt: start.toISOString(), days: { '2026-09-26': 1, '2026-09-27': 2 } });
    expect(weekStrip(week, wed).slots[0].used).toBe(3);
  });
});

describe('formatResetAt', () => {
  it('weekday and 12-hour time, local', () => {
    expect(formatResetAt(new Date(2026, 9, 3, 22, 30))).toBe('Sat 10:30 PM');
    expect(formatResetAt(new Date(2026, 9, 4, 0, 5))).toBe('Sun 12:05 AM');
    expect(formatResetAt(new Date(2026, 9, 4, 18, 0))).toBe('Sun 6 PM');
  });
});

describe('usageView', () => {
  const now = new Date(Date.parse(RESET1) - (3 * 24 + 22) * HOUR);
  const ago = (ms) => `${Math.round(ms / 60000)} min`;
  const account = (state, weeks = { [WEEK1]: { weekReset: RESET1, used: 31.6, lastReadingAt: now.toISOString(), days: {} } }) => ({
    status: { state, lastSuccess: new Date(now - 4 * 60000).toISOString() },
    weeks,
  });

  it('shows used/unused, the day strip, and when it resets', () => {
    const v = usageView('org', account('ok'), now, ago);
    expect(v).toMatchObject({ used: 31.6, available: 68, resetsIn: '3d 22h', resetsAt: formatResetAt(RESET1), note: null });
    expect(v.strip.slots).toHaveLength(7);
    expect(v.strip.untracked).toBe(31.6);
    expect(v.pattern).toBe(`Last week's unused % shows here after ${formatShortDate(RESET1)}`);
  });

  it("reports last week's expired capacity once a week has finished", () => {
    const PREV = '2026-09-20T17:00:00.000Z';
    const weeks = {
      [PREV]: { weekReset: WEEK1, used: 55, lastReadingAt: '2026-09-27T16:30:00Z', days: {} },
      [WEEK1]: { weekReset: RESET1, used: 31.6, lastReadingAt: now.toISOString(), days: {} },
    };
    expect(usageView('org', account('ok', weeks), now, ago).pattern).toBe('Last week: 45% expired unused');
  });

  it('names the week when the last finished one is not the previous week', () => {
    const OLD = '2026-09-06T17:00:00.000Z', OLD_RESET = '2026-09-13T17:00:00.000Z';
    const weeks = {
      [OLD]: { weekReset: OLD_RESET, used: 70, lastReadingAt: OLD_RESET, days: {} },
      [WEEK1]: { weekReset: RESET1, used: 31.6, lastReadingAt: now.toISOString(), days: {} },
    };
    expect(usageView('org', account('ok', weeks), now, ago).pattern)
      .toBe(`Week to ${formatShortDate(OLD_RESET)}: 30% expired unused`);
  });

  it('keeps the last numbers while logged out, with a note', () => {
    const v = usageView('org', account('logged_out'), now, ago);
    expect(v.available).toBe(68);
    expect(v.note).toBe('Logged out · Last updated 4 min ago');
  });

  it('keeps the last numbers through a transient error, with a freshness note', () => {
    const v = usageView('org', account('error'), now, ago);
    expect(v.available).toBe(68);
    expect(v.note).toBe('Last updated 4 min ago');
  });

  it('explains every state without data', () => {
    expect(usageView(null, undefined, now, ago)).toEqual({ message: 'Log in to claude.ai to start tracking' });
    expect(usageView('org', undefined, now, ago).message).toBe('Waiting for the first reading');
    expect(usageView('org', account('logged_out', {}), now, ago).message).toBe('Logged out, log in to claude.ai to resume');
    expect(usageView('org', account('no_weekly_limit'), now, ago).message).toBe('Your plan has no weekly limit');
    expect(usageView('org', account('broken'), now, ago).message).toBe("Can't read usage, needs an extension update");
    expect(usageView('org', account('error', {}), now, ago).message).toBe("Couldn't reach Claude, will retry");
  });

  it('does not show a finished week as current', () => {
    expect(usageView('org', account('ok'), new Date('2026-10-05T00:00:00Z'), ago).message).toBe('New week started, updating');
  });
});
