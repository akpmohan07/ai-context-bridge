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
// A day has an entry once any capture happened on it (0 = watched, no usage);
// a past day with no entry wasn't watched (browser closed, logged out…).
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

// Usage between two captures can only be put on a day when they're close
// together: after a longer gap (browser closed, asleep, logged out, using
// another account) we can't tell when it happened, so it stays untracked —
// in the week's total, on no day.
const MAX_GAP_MS = 45 * 60 * 1000;

// Latest reading across all of an account's weeks, as ms (null: none yet).
function lastReadingTime(weeks) {
    let last = null;
    for (const week of Object.values(weeks)) {
        const t = Date.parse(week.lastReadingAt);
        if (!Number.isNaN(t) && (last === null || t > last)) last = t;
    }
    return last;
}

// Spread `amount` over the local days between two moments, in proportion to
// time — usage between 23:50 and 00:05 lands mostly on the earlier day. The
// last day takes the rounding remainder so the shares add up exactly.
export function splitByDay(from, to, amount) {
    if (!(to > from)) return { [localDayKey(to)]: amount };
    const shares = {};
    let t = from;
    let left = amount;
    while (t < to) {
        const d = new Date(t);
        const end = Math.min(to, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime());
        const share = end === to ? left : round2((amount * (end - t)) / (to - from));
        const key = localDayKey(t);
        shares[key] = round2((shares[key] ?? 0) + share);
        left = round2(left - share);
        t = end;
    }
    return shares;
}

// Fold one reading into an account's weeks. Returns new objects (inputs are
// not mutated). Growth since the previous reading:
//   same week → util − previous (negative = a limit reset → 0)
//   new week  → util (a week counts up from 0 at its reset)
// It goes on a day only when the previous reading (from any week) is at most
// MAX_GAP_MS old, split across midnight if the gap spans one; otherwise it's
// untracked. The reading's own day always gets an entry, marking it watched.
// A reading older than the account's latest one (out of order) is ignored.
export function applyReading({ weeks = {} }, reading) {
    const { asOf, util, weekStart, weekReset } = reading;
    const t = Date.parse(asOf);
    const prevAt = lastReadingTime(weeks);
    if (prevAt !== null && t < prevAt) return { weeks };

    const prev = weeks[weekStart];
    const growth = round2(prev ? Math.max(0, util - prev.used) : util);
    const days = { ...(prev?.days ?? {}) };
    if (growth > 0 && prevAt !== null && t - prevAt <= MAX_GAP_MS) {
        const from = Math.max(prevAt, Date.parse(weekStart));
        for (const [key, share] of Object.entries(splitByDay(from, t, growth))) {
            days[key] = round2((days[key] ?? 0) + share);
        }
    }
    const today = localDayKey(asOf);
    if (!(today in days)) days[today] = 0;

    return { weeks: { ...weeks, [weekStart]: { weekReset, used: util, lastReadingAt: asOf, days } } };
}

// Schema 1 → 2: rebuild the weeks from the raw reading log with the rules
// above. `logs` is { [weekStart]: [[unixSeconds, util], …] }. A week with no
// log (captured before the log existed) keeps its numbers; its days from the
// first capture to the last count as watched, which is what schema 1 meant.
export function rebuildWeeks(weeks = {}, logs = {}) {
    const readings = [];
    const kept = {};
    for (const [weekStart, week] of Object.entries(weeks)) {
        const log = logs[weekStart];
        if (Array.isArray(log) && log.length) {
            for (const [sec, util] of log) {
                readings.push({ asOf: new Date(sec * 1000).toISOString(), util, weekStart, weekReset: week.weekReset });
            }
        } else {
            kept[weekStart] = legacyWeek(week);
        }
    }
    readings.sort((a, b) => Date.parse(a.asOf) - Date.parse(b.asOf));
    let account = { weeks: {} };
    for (const reading of readings) account = applyReading(account, reading);
    return { ...kept, ...account.weeks };
}

function legacyWeek({ firstReadingAt, ...week }) {
    const days = { ...(week.days ?? {}) };
    const first = new Date(firstReadingAt ?? week.lastReadingAt);
    const lastKey = localDayKey(week.lastReadingAt);
    if (!Number.isNaN(first.getTime())) {
        for (let d = first; localDayKey(d) <= lastKey; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
            const key = localDayKey(d);
            if (!(key in days)) days[key] = 0;
        }
    }
    return { ...week, days };
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
// `used` is the day's % of the weekly limit (0 = watched, no usage). A past
// day nobody watched is `untracked` (used: null). Also returns `untracked`,
// the weekly % that has no day. A mid-week limit reset lowers the week's total
// but not the days already counted, so then the days are scaled down to add
// up to it.
export function weekStrip(week, now) {
    const start = Date.parse(week.weekStart);
    const todayKey = localDayKey(now);
    const days = week.days ?? {};

    const slots = Array.from({ length: 7 }, (_, i) => {
        const mid = new Date(start + i * 86400000 + 43200000);
        return { label: WEEKDAYS[mid.getDay()], key: localDayKey(mid), used: 0, watched: false };
    });
    for (const [key, used] of Object.entries(days)) {
        const slot = slots.find(s => s.key === key) ?? (key < slots[0].key ? slots[0] : slots[6]);
        slot.used += used;
        slot.watched = true;
    }

    const tracked = Object.values(days).reduce((sum, used) => sum + used, 0);
    const scale = tracked > week.used && tracked > 0 ? week.used / tracked : 1;
    const untracked = Math.max(0, round2(week.used - tracked));
    for (const slot of slots) {
        slot.when = slot.key < todayKey ? 'past' : slot.key === todayKey ? 'today' : 'future';
        slot.untracked = slot.when !== 'future' && !slot.watched;
        slot.used = slot.untracked ? null : round2(slot.used * scale);
        delete slot.watched;
    }
    return { slots, untracked };
}

// "15 – 22 Nov", or "25 Oct – 1 Nov" across a month, in local time.
export function formatWeekRange(weekStart, weekReset) {
    const a = new Date(weekStart);
    const b = new Date(weekReset);
    return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
        ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
        : `${formatShortDate(a)} – ${formatShortDate(b)}`;
}

// Efficiency: how much of the paid weekly capacity actually got used, as the
// average of the last `n` finished weeks' totals. null until a week finishes.
export const EFFICIENCY_WEEKS = 6;
export function efficiency(weeks, now, n = EFFICIENCY_WEEKS) {
    const finished = Object.values(weeks ?? {})
        .filter(w => Date.parse(w.weekReset) <= now)
        .sort((a, b) => Date.parse(b.weekReset) - Date.parse(a.weekReset))
        .slice(0, n);
    if (!finished.length) return null;
    const pct = finished.reduce((sum, w) => sum + Math.min(100, w.used), 0) / finished.length;
    return { pct: Math.round(pct), weeks: finished.length };
}

// "Sat 10:30 PM" / "Sun 6 PM" in local time (":00" dropped).
export function formatResetAt(date) {
    const d = new Date(date);
    const h = d.getHours();
    const m = d.getMinutes();
    const time = m ? `${h % 12 || 12}:${String(m).padStart(2, '0')}` : `${h % 12 || 12}`;
    return `${WEEKDAYS[d.getDay()]} ${time} ${h < 12 ? 'AM' : 'PM'}`;
}

// The efficiency line under the bar.
function efficiencyLine(weeks, current, now) {
    const eff = efficiency(weeks, now);
    if (!eff) return { pct: null, text: `Efficiency shows here after ${formatShortDate(current.weekReset)}` };
    return { pct: eff.pct, text: eff.weeks === 1 ? 'efficiency · last week' : `efficiency · avg of last ${eff.weeks} weeks` };
}

// What the popup's usage block shows, from stored data alone. Either
// { message } (nothing to draw) or the selected week:
//   { weekStart, past, used, available, strip, resetsAt, resetsIn,
//     weeks, efficiency, note }
// `available` is what's left (past week: what expired). `weeks` is the chip
// row, newest first: { weekStart, label, used, current }. `selected` is a
// weekStart to show instead of the current week. `account` is
// claudeUsage[orgId] (undefined before the first capture); `formatAgo(ms)`
// renders "5 min" etc.
export function usageView(orgId, account, now, formatAgo, selected = null) {
    if (!orgId) return { message: 'Log in to claude.ai to start tracking' };
    if (!account) return { message: 'Waiting for the first reading' };

    const { state, lastSuccess } = account.status ?? {};
    if (state === 'no_weekly_limit') return { message: 'Your plan has no weekly limit' };
    if (state === 'broken') return { message: "Can't read usage, needs an extension update" };

    const current = currentWeek(account.weeks);
    if (!current) {
        return { message: state === 'logged_out' ? 'Logged out, log in to claude.ai to resume' : "Couldn't reach Claude, will retry" };
    }
    const { msLeft } = summarize(current, now);
    if (msLeft === 0) return { message: 'New week started, updating' };

    const pick = selected && selected !== current.weekStart && account.weeks[selected];
    const week = pick ? { weekStart: selected, ...pick } : current;
    const used = Math.min(100, week.used);

    return {
        weekStart: week.weekStart,
        past: !!pick,
        used,
        available: Math.round(100 - used),
        strip: weekStrip(week, now),
        resetsAt: formatResetAt(current.weekReset),
        resetsIn: formatTimeLeft(msLeft),
        weeks: Object.entries(account.weeks)
            .sort(([, a], [, b]) => Date.parse(b.weekReset) - Date.parse(a.weekReset))
            .map(([weekStart, w]) => ({
                weekStart,
                label: formatWeekRange(weekStart, w.weekReset),
                used: Math.min(100, w.used),
                current: weekStart === current.weekStart,
            })),
        efficiency: efficiencyLine(account.weeks, current, now),
        // Freshness only matters when capture is failing; the last known
        // numbers stay visible either way.
        note: state === 'error' || state === 'logged_out'
            ? `${state === 'logged_out' ? 'Logged out · ' : ''}Last updated ${formatAgo(now - Date.parse(lastSuccess))} ago`
            : null,
    };
}
