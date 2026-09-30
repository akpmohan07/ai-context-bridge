// Pure Claude usage-capture logic (#27) — no chrome/fetch. The imperative shell
// (claude-usage-capture.js, run by the background worker) fetches
// /api/organizations/{orgId}/usage, feeds the JSON through parseUsage, then
// applyReading, and writes the result.
//
// Storage shape — account → weeks → days:
//   claudeUsage[orgId] = {
//     schemaVersion, status,
//     weeks: { [weekStart]: { weekReset, used, lastReadingAt,
//                             days: { [YYYY-MM-DD]: used } } },
//   }
// One record per Claude account (org), so an account switch never mixes data.
// A week's `used` is the API's weekly total as-is; its `days` are derived from
// how much that total grew between captures, so data flows week → days, never
// back. Days live inside their week because a reset lands mid-day: the two
// halves of that day belong to different weeks. Month/year views are computed
// from weeks, not stored.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// resets_at / window_started_at carry microseconds that may jitter between
// calls; the week key must be stable, so round to the minute.
function toMinuteIso(value) {
    const t = Date.parse(value);
    if (Number.isNaN(t)) return null;
    return new Date(Math.round(t / 60000) * 60000).toISOString();
}

const round2 = (n) => Math.round(n * 100) / 100;

// API JSON → { ok: true, reading } | { ok: false, reason }. Only the weekly
// window is required; the flat `seven_day` block is preferred (float
// precision), the normalized `limits[]` entry is the fallback if it ever
// disappears. A recognizable response with no weekly window is a plan without
// a weekly limit ('no_weekly_limit'), not a broken format ('broken').
export function parseUsage(json, now = new Date()) {
    let util = json?.seven_day?.utilization;
    let resetsAt = json?.seven_day?.resets_at;
    if (typeof util !== 'number') {
        const weekly = json?.limits?.find?.(l => l?.kind === 'weekly_all');
        util = weekly?.percent;
        resetsAt = weekly?.resets_at;
    }
    const weekReset = toMinuteIso(resetsAt);
    if (typeof util !== 'number' || util < 0 || !weekReset) {
        const recognizable = json && typeof json === 'object' && 'seven_day' in json && Array.isArray(json.limits);
        const noWeekly = recognizable && !json.seven_day && !json.limits.some(l => l?.kind === 'weekly_all');
        return { ok: false, reason: noWeekly ? 'no_weekly_limit' : 'broken' };
    }

    const breakdown = json?.seven_day_breakdown;
    const weekStart = toMinuteIso(breakdown?.window_started_at)
        ?? new Date(Date.parse(weekReset) - WEEK_MS).toISOString();
    const asOf = Number.isNaN(Date.parse(breakdown?.as_of))
        ? now.toISOString()
        : new Date(breakdown.as_of).toISOString();

    // Overage (paid extra usage) can push utilization past 100; the week is
    // simply fully used, so clamp once here and nothing downstream goes negative.
    return { ok: true, reading: { asOf, util: Math.min(100, util), weekStart, weekReset } };
}

// A failed usage fetch → { state, error } for the account status. Only Claude's
// own "session invalid" answer counts as logged out (it pauses background
// captures). Verified logged-out response: 403 application/json with
// error.details.error_code "account_session_invalid". A 403 HTML page is
// Cloudflare's bot check, not a logout — like any other failure it's a
// transient 'error' and capture keeps trying.
export function classifyFailure(httpStatus, contentType, body) {
    const code = body?.error?.details?.error_code;
    if (contentType?.includes('json') && (httpStatus === 401 || code === 'account_session_invalid')) {
        return { state: 'logged_out', error: { code: httpStatus, detail: code ?? null } };
    }
    return {
        state: 'error',
        error: { code: httpStatus, detail: code ?? (contentType?.includes('html') ? 'html' : null) },
    };
}

// /api/organizations → the org whose usage to track: the one that hosts the
// chat product (Team/Enterprise members may also have a personal org), else
// the first. null when the list is empty or unrecognizable.
export function selectOrgId(orgs) {
    const list = Array.isArray(orgs) ? orgs : [];
    const org = list.find(o => Array.isArray(o?.capabilities) && o.capabilities.includes('chat')) ?? list[0];
    return org?.uuid ?? null;
}

// While logged out, background captures back off instead of polling every
// tick: 5 min, 10, 20… capped at 6h, reset by any success. A claude.ai visit or
// opening the popup always tries right away.
const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
export function backoffMs(fails) {
    return fails > 0 ? Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (fails - 1)) : 0;
}

// Local calendar day of a moment, as YYYY-MM-DD — a "day" is the user's day.
export function localDayKey(date) {
    const d = new Date(date);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

// A new week's first reading can only be pinned to a day if it came right
// after the reset; later than this, we don't know which days that usage fell on.
const FRESH_WEEK_MS = 60 * 60 * 1000;

// Fold one reading into an account's weeks. Returns new objects (inputs are
// not mutated). The current week's record doubles as the "previous value" the
// daily delta is measured against, and the delta goes to that week's day:
//   same week  → delta = util − previous (negative = limit reset → 0)
//   new week   → delta = util if the reading is within an hour of the reset
//                (the week counts up from 0), else 0 — usage from before we
//                started watching this week stays untracked (no day)
// `firstReadingAt` marks when this week's tracking began: days before it are
// untracked, days after it with no entry had no usage.
// A reading older than the stored one (out of order) is ignored.
export function applyReading({ weeks = {} }, reading, dayKey = localDayKey(reading.asOf)) {
    const { asOf, util, weekStart, weekReset } = reading;
    const prev = weeks[weekStart];

    if (prev && Date.parse(asOf) < Date.parse(prev.lastReadingAt)) {
        return { weeks };
    }

    let delta;
    if (prev) delta = Math.max(0, util - prev.used);
    else delta = Date.parse(asOf) - Date.parse(weekStart) <= FRESH_WEEK_MS ? util : 0;
    delta = round2(delta);

    const days = prev?.days ?? {};
    return {
        weeks: {
            ...weeks,
            [weekStart]: {
                weekReset,
                used: util,
                firstReadingAt: prev?.firstReadingAt ?? asOf,
                lastReadingAt: asOf,
                days: delta > 0 ? { ...days, [dayKey]: round2((days[dayKey] ?? 0) + delta) } : days,
            },
        },
    };
}

// Raw reading log (#27): every successful reading, kept alongside the derived
// weeks/days so attribution can be audited and recomputed later. One storage
// key per account-week, so a capture rewrites only the current week's list.
// Entries are compact [unixSeconds, util] pairs (~6 KB/day); no retention cap.
// Only successful readings are logged — a gap means "not captured".
export function readingsKey(orgId, weekStart) {
    return `claudeReadings:${orgId}:${weekStart}`;
}

// Append a reading; one older than (or at the same second as) the last entry
// is dropped, so the log stays strictly in time order.
export function appendReading(log, { asOf, util }) {
    const list = Array.isArray(log) ? log : [];
    const t = Math.round(Date.parse(asOf) / 1000);
    const last = list[list.length - 1];
    if (last && t <= last[0]) return list;
    return [...list, [t, util]];
}

// The week the popup shows: the one with the latest reset.
export function currentWeek(weeks) {
    const entries = Object.entries(weeks ?? {});
    if (!entries.length) return null;
    const [weekStart, week] = entries.reduce((a, b) => (Date.parse(b[1].weekReset) > Date.parse(a[1].weekReset) ? b : a));
    return { weekStart, ...week };
}

// What the foundation displays: unused % and time until reset.
export function summarize(week, now = new Date()) {
    if (!week) return null;
    return {
        unused: Math.max(0, round2(100 - week.used)),
        msLeft: Math.max(0, Date.parse(week.weekReset) - now),
    };
}

export function formatTimeLeft(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "4 Oct" in local time.
export function formatShortDate(date) {
    const d = new Date(date);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// The week as 7 day slots for the strip under the bar, Sun…Sat for a week
// that starts Sat night. Each slot is the local day at that 24h slice's
// midpoint; a sliver of the reset day before the first slot folds into it.
//   { label, key, used, when: 'past'|'today'|'future', untracked }
// `used` is the day's % of the weekly limit (0 = tracked, no usage). Days
// before tracking began this week are `untracked` (used: null) — their usage
// is in the week total but not on any day. Also returns `untracked`, the
// weekly % that has no day.
export function weekStrip(week, now) {
    const start = Date.parse(week.weekStart);
    const todayKey = localDayKey(now);
    const firstKey = localDayKey(week.firstReadingAt ?? week.lastReadingAt ?? now);
    const days = week.days ?? {};

    const slots = Array.from({ length: 7 }, (_, i) => {
        const mid = new Date(start + i * 86400000 + 43200000);
        return { label: WEEKDAYS[mid.getDay()], key: localDayKey(mid), used: 0 };
    });
    for (const [key, used] of Object.entries(days)) {
        const slot = slots.find(s => s.key === key) ?? (key < slots[0].key ? slots[0] : slots[6]);
        slot.used = round2(slot.used + used);
    }

    const tracked = Object.values(days).reduce((sum, used) => sum + used, 0);
    const untracked = Math.max(0, round2(week.used - tracked));
    for (const slot of slots) {
        slot.when = slot.key < todayKey ? 'past' : slot.key === todayKey ? 'today' : 'future';
        slot.untracked = slot.when !== 'future' && slot.key < firstKey && slot.used === 0;
        if (slot.untracked) slot.used = null;
    }
    return { slots, untracked };
}

// "Sat 10:30 PM" / "Sun 6 PM" in local time (":00" dropped).
export function formatResetAt(date) {
    const d = new Date(date);
    const h = d.getHours();
    const m = d.getMinutes();
    const time = m ? `${h % 12 || 12}:${String(m).padStart(2, '0')}` : `${h % 12 || 12}`;
    return `${WEEKDAYS[d.getDay()]} ${time} ${h < 12 ? 'AM' : 'PM'}`;
}

// The pattern line under the bar: what happened to the last finished week.
function patternLine(weeks, current) {
    const finished = Object.entries(weeks ?? {})
        .filter(([, w]) => Date.parse(w.weekReset) <= Date.parse(current.weekStart))
        .sort(([a], [b]) => b.localeCompare(a));
    if (!finished.length) return `Last week's unused % shows here after ${formatShortDate(current.weekReset)}`;
    const [, last] = finished[0];
    const unused = Math.round(100 - last.used);
    return last.weekReset === current.weekStart
        ? `Last week: ${unused}% expired unused`
        : `Week to ${formatShortDate(last.weekReset)}: ${unused}% expired unused`;
}

// What the popup's usage block shows, from stored data alone. Either
// { message } (nothing to draw) or { used, available, strip, resetsAt,
// resetsIn, pattern, note }: the bar (used vs unused) and the day strip it's
// made of. `account` is claudeUsage[orgId]
// (undefined before the first capture); `formatAgo(ms)` renders "5 min" etc.
export function usageView(orgId, account, now, formatAgo) {
    if (!orgId) return { message: 'Log in to claude.ai to start tracking' };
    if (!account) return { message: 'Waiting for the first reading' };

    const { state, lastSuccess } = account.status ?? {};
    if (state === 'no_weekly_limit') return { message: 'Your plan has no weekly limit' };
    if (state === 'broken') return { message: "Can't read usage, needs an extension update" };

    const week = currentWeek(account.weeks);
    if (!week) {
        return { message: state === 'logged_out' ? 'Logged out, log in to claude.ai to resume' : "Couldn't reach Claude, will retry" };
    }
    const { unused, msLeft } = summarize(week, now);
    if (msLeft === 0) return { message: 'New week started, updating' };

    return {
        used: Math.min(100, week.used),
        available: Math.round(unused),
        strip: weekStrip(week, now),
        resetsAt: formatResetAt(week.weekReset),
        resetsIn: formatTimeLeft(msLeft),
        pattern: patternLine(account.weeks, week),
        // Freshness only matters when capture is failing; the last known
        // numbers stay visible either way.
        note: state === 'error' || state === 'logged_out'
            ? `${state === 'logged_out' ? 'Logged out · ' : ''}Last updated ${formatAgo(now - Date.parse(lastSuccess))} ago`
            : null,
    };
}
