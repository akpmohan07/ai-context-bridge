import { describe, it, expect } from 'vitest';
import {
  parseUsage, classifyFailure, selectOrgId, backoffMs, readingsKey, appendReading, localDayKey, applyReading,
  splitByDay, rebuildWeeks, currentWeek, summarize, formatTimeLeft, usageView, weekStrip, formatShortDate,
  formatResetAt, formatWeekRange, efficiency, sessionView,
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

// A local wall-clock moment as ISO, so day keys don't depend on the test
// machine's timezone. at(30, 8) = 30 Sep 2026 08:00 local.
const at = (day, h, m = 0, month = 9) => new Date(2026, month - 1, day, h, m).toISOString();
const MIN = 60 * 1000;
const plus = (iso, ms) => new Date(Date.parse(iso) + ms).toISOString();

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

  it('reads the 5-hour session alongside the week', () => {
    expect(parseUsage(api()).session).toEqual({ util: 14, resetsAt: '2026-09-30T20:20:00.000Z', asOf: '2026-09-30T16:43:13.108Z' });
    expect(parseUsage(api({ five_hour: null })).session.util).toBe(14); // limits[] fallback
    expect(parseUsage(api({ five_hour: { utilization: 0, resets_at: null } })).session.resetsAt).toBeNull(); // idle
    expect(parseUsage(api({ five_hour: null, limits: [{ kind: 'weekly_all', percent: 30, resets_at: '2026-10-04T16:59:59Z' }] })).session).toBeNull();
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
  const fold = (...readings) => readings.reduce((s, r) => applyReading(s, r), {});

  it('first ever capture: the day is watched, but usage before it has no day', () => {
    const s = fold(reading(30, at(30, 8)));
    expect(week(s)).toEqual({ weekReset: RESET1, used: 30, lastReadingAt: at(30, 8), days: { '2026-09-30': 0 } });
  });

  it('close captures put the growth between them on the day', () => {
    const s = fold(reading(31, at(30, 9)), reading(33, at(30, 9, 5)), reading(36, at(30, 9, 10)), reading(36, at(30, 9, 50)));
    expect(week(s).days).toEqual({ '2026-09-30': 5 });
    expect(week(s).used).toBe(36);
  });

  it('growth after a long gap stays untracked, but the day is still watched', () => {
    const s = fold(reading(30, at(30, 8)), reading(35, at(30, 8, 5)), reading(50, at(1, 14, 0, 10)));
    expect(week(s).days).toEqual({ '2026-09-30': 5, '2026-10-01': 0 });
    expect(week(s).used).toBe(50);
  });

  it('growth across midnight is split by time between the two days', () => {
    const s = fold(reading(40, at(30, 23, 50)), reading(43, at(1, 0, 5, 10)));
    expect(week(s).days).toEqual({ '2026-09-30': 2, '2026-10-01': 1 });
  });

  it('a mid-week limit reset (usage drops) adds nothing and keeps past days', () => {
    const s = fold(reading(38, at(30, 7, 55)), reading(40, at(30, 8)), reading(5, at(30, 8, 5)), reading(8, at(30, 8, 10)));
    expect(week(s).days).toEqual({ '2026-09-30': 5 });
    expect(week(s).used).toBe(8);
  });

  it('a new week right after the reset counts up from 0; the old week freezes', () => {
    const before = plus(RESET1, -10 * MIN), after = plus(RESET1, 15 * MIN);
    const s = fold(reading(54, plus(before, -5 * MIN)), reading(55, before), reading(2, after, WEEK2, RESET2));
    expect(week(s, WEEK1)).toMatchObject({ used: 55, lastReadingAt: before });
    expect(week(s, WEEK2).used).toBe(2);
    const sum = Object.values(week(s, WEEK2).days).reduce((a, d) => a + d, 0);
    expect(sum).toBe(2);
  });

  it('a new week first seen long after its reset keeps that usage off any day', () => {
    const s = fold(reading(55, plus(RESET1, -HOUR)), reading(20, at(6, 9, 0, 10), WEEK2, RESET2));
    expect(week(s, WEEK2).days).toEqual({ '2026-10-06': 0 });
  });

  it('skipped weeks simply have no record', () => {
    const later = '2026-10-18T17:00:00.000Z';
    const s = fold(reading(20, at(28, 10)), reading(10, at(19, 10, 0, 10), later, '2026-10-25T17:00:00.000Z'));
    expect(Object.keys(s.weeks)).toEqual([WEEK1, later]);
  });

  it("ignores a reading older than the account's latest, from any week", () => {
    const s = fold(reading(55, plus(RESET1, -HOUR)), reading(3, plus(RESET1, HOUR), WEEK2, RESET2));
    expect(applyReading(s, reading(56, plus(RESET1, -30 * MIN)))).toEqual(s);
  });

  it('does not mutate its input', () => {
    const s0 = fold(reading(30, at(30, 8)));
    const snapshot = JSON.stringify(s0);
    applyReading(s0, reading(40, at(30, 8, 5)));
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it("with no gaps, a week's days add up to its growth since the first capture", () => {
    const utils = [12, 12.5, 19, 19, 26.25, 31, 44, 47.75];
    const s = fold(...utils.map((u, i) => reading(u, plus(at(30, 22), i * 20 * MIN))));
    const sum = Object.values(week(s).days).reduce((a, d) => a + d, 0);
    expect(sum).toBeCloseTo(47.75 - 12, 5);
  });
});

describe('splitByDay', () => {
  it('one day takes it all', () => {
    expect(splitByDay(Date.parse(at(30, 9)), Date.parse(at(30, 9, 20)), 4)).toEqual({ '2026-09-30': 4 });
  });

  it('shares add up exactly across midnight', () => {
    const shares = splitByDay(Date.parse(at(30, 23, 40)), Date.parse(at(1, 0, 10, 10)), 1);
    expect(shares['2026-09-30'] + shares['2026-10-01']).toBe(1);
    expect(shares['2026-09-30']).toBeCloseTo(0.67, 2);
  });
});

describe('rebuildWeeks', () => {
  const sec = (iso) => Date.parse(iso) / 1000;

  it('recomputes a logged week exactly as live capture would have', () => {
    const readings = [reading(30, at(30, 8)), reading(33, at(30, 8, 5)), reading(40, at(1, 12, 0, 10))];
    const live = readings.reduce((s, r) => applyReading(s, r), {}).weeks;
    const old = { [WEEK1]: { weekReset: RESET1, used: 40, firstReadingAt: at(30, 8), lastReadingAt: at(1, 12, 0, 10), days: { '2026-10-01': 7, '2026-09-30': 3 } } };
    const logs = { [WEEK1]: readings.map(r => [sec(r.asOf), r.util]) };
    expect(rebuildWeeks(old, logs)).toEqual(live);
  });

  it('a week without a log keeps its numbers; first-to-last days count as watched', () => {
    const old = { [WEEK1]: { weekReset: RESET1, used: 31, firstReadingAt: at(29, 10), lastReadingAt: at(1, 9, 0, 10), days: { '2026-09-30': 6 } } };
    expect(rebuildWeeks(old, {})).toEqual({
      [WEEK1]: { weekReset: RESET1, used: 31, lastReadingAt: at(1, 9, 0, 10), days: { '2026-09-29': 0, '2026-09-30': 6, '2026-10-01': 0 } },
    });
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
    const { slots } = weekStrip(wk({ used: 0, days: {} }), wed);
    expect(slots.map(s => s.label)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(slots.map(s => s.when)).toEqual(['past', 'past', 'past', 'today', 'future', 'future', 'future']);
  });

  it('days nobody watched are untracked; their usage has no day', () => {
    const { slots, untracked } = weekStrip(wk({ used: 32, days: { '2026-09-28': 0, '2026-09-30': 4 } }), wed);
    expect(slots.slice(0, 4).map(s => s.used)).toEqual([null, 0, null, 4]);
    expect(slots.slice(0, 4).map(s => s.untracked)).toEqual([true, false, true, false]);
    expect(untracked).toBe(28);
  });

  it('the sliver of the reset day before Sunday folds into the first slot', () => {
    const week = wk({ used: 3, days: { '2026-09-26': 1, '2026-09-27': 2 } });
    expect(weekStrip(week, wed).slots[0].used).toBe(3);
  });

  it('after a mid-week limit reset, days scale down to the new total', () => {
    const { slots, untracked } = weekStrip(wk({ used: 10, days: { '2026-09-27': 15, '2026-09-28': 5, '2026-09-30': 0 } }), wed);
    expect(slots.slice(0, 2).map(s => s.used)).toEqual([7.5, 2.5]);
    expect(untracked).toBe(0);
  });

  it('a finished week is all past', () => {
    const { slots } = weekStrip(wk({ used: 5, days: {} }), new Date(2026, 9, 10));
    expect(slots.every(s => s.when === 'past' && s.untracked)).toBe(true);
  });
});

describe('formatWeekRange', () => {
  it('one month, or both months when it crosses one', () => {
    expect(formatWeekRange(new Date(2026, 10, 15, 17), new Date(2026, 10, 22, 17))).toBe('15 – 22 Nov');
    expect(formatWeekRange(new Date(2026, 9, 25, 17), new Date(2026, 10, 1, 17))).toBe('25 Oct – 1 Nov');
    expect(formatWeekRange(new Date(2026, 11, 28, 17), new Date(2027, 0, 4, 17))).toBe('28 Dec – 4 Jan');
  });
});

describe('efficiency', () => {
  const w = (resetDay, used) => ({ weekReset: new Date(2026, 9, resetDay).toISOString(), used });
  const now = new Date(2026, 9, 30);

  it('averages the last finished weeks, newest first, ignoring the current one', () => {
    const weeks = { a: w(4, 40), b: w(11, 20), c: w(18, 100), d: w(25, 60), cur: w(32, 5) };
    expect(efficiency(weeks, now)).toEqual({ pct: 55, weeks: 4 });
    expect(efficiency(weeks, now, 2)).toEqual({ pct: 80, weeks: 2 });
  });

  it('caps overage at 100 and is null before any week finishes', () => {
    expect(efficiency({ a: w(25, 130) }, now)).toEqual({ pct: 100, weeks: 1 });
    expect(efficiency({ cur: w(32, 5) }, now)).toBeNull();
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
  const CUR = { weekReset: RESET1, used: 31.6, lastReadingAt: now.toISOString(), days: {} };
  const account = (state, weeks = { [WEEK1]: CUR }) => ({
    status: { state, lastSuccess: new Date(now - 4 * 60000).toISOString() },
    weeks,
  });
  const PREV = '2026-09-20T17:00:00.000Z';
  const OLD = '2026-09-13T17:00:00.000Z';
  const history = {
    [OLD]: { weekReset: PREV, used: 70, lastReadingAt: PREV, days: {} },
    [PREV]: { weekReset: WEEK1, used: 55, lastReadingAt: '2026-09-27T16:30:00Z', days: { '2026-09-25': 4 } },
    [WEEK1]: CUR,
  };

  it('shows used/unused, the day strip, and when it resets', () => {
    const v = usageView('org', account('ok'), now, ago);
    expect(v).toMatchObject({ weekStart: WEEK1, past: false, used: 31.6, available: 68, resetsIn: '3d 22h', resetsAt: formatResetAt(RESET1), note: null });
    expect(v.strip.slots).toHaveLength(7);
    expect(v.strip.untracked).toBe(31.6);
    expect(v.efficiency).toEqual({ pct: null, text: `Efficiency shows here after ${formatShortDate(RESET1)}` });
  });

  it('lists every week newest first, labelled by its dates', () => {
    const { weeks } = usageView('org', account('ok', history), now, ago);
    expect(weeks.map(w => w.weekStart)).toEqual([WEEK1, PREV, OLD]);
    expect(weeks[0]).toEqual({ weekStart: WEEK1, label: formatWeekRange(WEEK1, RESET1), used: 31.6, current: true });
    expect(weeks.slice(1).every(w => !w.current)).toBe(true);
  });

  it('averages finished weeks into the efficiency line', () => {
    expect(usageView('org', account('ok', history), now, ago).efficiency)
      .toEqual({ pct: 63, text: 'efficiency · avg of last 2 weeks' });
    const one = { [PREV]: history[PREV], [WEEK1]: CUR };
    expect(usageView('org', account('ok', one), now, ago).efficiency).toEqual({ pct: 55, text: 'efficiency · last week' });
  });

  it('a selected past week shows what expired, with its own days', () => {
    const v = usageView('org', account('ok', history), now, ago, PREV);
    expect(v).toMatchObject({ weekStart: PREV, past: true, used: 55, available: 45 });
    expect(v.strip.slots.every(s => s.when === 'past')).toBe(true);
    expect(v.resetsIn).toBe('3d 22h'); // still the current week's countdown
  });

  it('an unknown or current selection falls back to the current week', () => {
    expect(usageView('org', account('ok', history), now, ago, 'gone').weekStart).toBe(WEEK1);
    expect(usageView('org', account('ok', history), now, ago, WEEK1).past).toBe(false);
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

  it('shows the latest session, reading an ended one as reset', () => {
    const session = { util: 55.4, resetsAt: new Date(now.getTime() + 2 * HOUR + 10 * 60000).toISOString(), asOf: now.toISOString() };
    expect(usageView('org', { ...account('ok'), session }, now, ago).session).toEqual({ used: 55, resetsIn: '2h 10m' });
    expect(usageView('org', account('ok'), now, ago).session).toBeNull();
    expect(sessionView({ ...session, resetsAt: new Date(now - 60000).toISOString() }, now)).toEqual({ used: 0, resetsIn: null });
    expect(sessionView({ ...session, util: 0, resetsAt: null }, now)).toEqual({ used: 0, resetsIn: null });
  });

  it('does not show a finished week as current', () => {
    expect(usageView('org', account('ok'), new Date('2026-10-05T00:00:00Z'), ago).message).toBe('New week started, updating');
  });
});
