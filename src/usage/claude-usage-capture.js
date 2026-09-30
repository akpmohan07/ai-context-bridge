// Imperative shell for Claude usage capture (#27). Run by the shared usage
// scheduler (scheduler.js) in the background worker — the single writer of
// `claudeUsage` (see claude-usage.js for its shape). `claudeOrgId` comes from
// the claude.ai content script, or from /api/organizations when claude.ai was
// never opened. All decisions live in claude-usage.js; this file only does
// chrome + fetch.
import { parseUsage, classifyFailure, applyReading, selectOrgId, backoffMs, readingsKey, appendReading } from './claude-usage.js';

const SCHEMA_VERSION = 1;
const API = 'https://claude.ai/api';
// A claude.ai page load or popup open also triggers a capture; don't hammer
// the API when several open at once.
const MIN_GAP_MS = 60 * 1000;

// The org to track. `claudeOrgId` is normally written by the claude.ai content
// script (the org the user is actually in); without it — claude.ai never
// opened on this browser — ask the API for the account's orgs. `rediscover`
// drops a stale cached id (the usage endpoint 404'd).
async function resolveOrgId({ rediscover = false } = {}) {
    if (!rediscover) {
        const { claudeOrgId } = await chrome.storage.local.get('claudeOrgId');
        if (claudeOrgId) return claudeOrgId;
    }
    try {
        const res = await fetch(`${API}/organizations`, { credentials: 'include' });
        if (!res.ok) return null;
        const orgId = selectOrgId(await res.json());
        if (orgId) await chrome.storage.local.set({ claudeOrgId: orgId });
        return orgId;
    } catch {
        return null;
    }
}

// source: 'background' (timer, startup) or 'page' (claude.ai opened, popup
// opened). While logged out, background captures back off (backoffMs); a page
// source always tries right away — the user may have just logged back in.
export async function captureClaudeUsage(trigger, { source = 'background' } = {}) {
    const orgId = await resolveOrgId();
    if (!orgId) return console.warn('[ACB] claude usage (%s): no org (logged out or never used Claude)', trigger);
    return captureOrg(orgId, trigger, source, { canRediscover: true });
}

async function captureOrg(orgId, trigger, source, { canRediscover }) {
    const { claudeUsage = {} } = await chrome.storage.local.get('claudeUsage');
    const account = claudeUsage[orgId] ?? { schemaVersion: SCHEMA_VERSION, status: {}, weeks: {} };
    const now = new Date();
    const lastAttempt = Date.parse(account.status.lastAttempt);
    if (source === 'page' && lastAttempt && now - lastAttempt < MIN_GAP_MS) return;
    if (source === 'background' && account.status.state === 'logged_out'
        && now - lastAttempt < backoffMs(account.status.fails ?? 0)) return;

    const status = { ...account.status, lastAttempt: now.toISOString() };
    const save = (next) => chrome.storage.local.set({ claudeUsage: { ...claudeUsage, [orgId]: next } });
    const fail = (state, error) => {
        console.warn('[ACB] claude usage (%s): %s', trigger, state, error ?? '');
        const fails = state === 'logged_out' ? (account.status.fails ?? 0) + 1 : 0;
        return save({ ...account, status: { ...status, state, fails, lastError: error } });
    };

    let res;
    try {
        res = await fetch(`${API}/organizations/${orgId}/usage`, { credentials: 'include' });
    } catch (e) {
        return fail('error', { code: 'network', message: String(e) });
    }
    // Cached org no longer valid (left a team, org deleted): find the current one.
    if (res.status === 404 && canRediscover) {
        const fresh = await resolveOrgId({ rediscover: true });
        if (fresh && fresh !== orgId) return captureOrg(fresh, trigger, source, { canRediscover: false });
    }
    const contentType = res.headers.get('content-type');
    let json = null;
    try { json = await res.json(); } catch { /* HTML challenge page etc. → rejected below */ }
    if (!res.ok) {
        const { state, error } = classifyFailure(res.status, contentType, json);
        return fail(state, error);
    }
    const parsed = parseUsage(json, now);
    if (!parsed.ok) return fail(parsed.reason, parsed.reason === 'broken' ? { code: 'shape' } : null);

    const { weeks } = applyReading(account, parsed.reading);
    const logKey = readingsKey(orgId, parsed.reading.weekStart);
    const { [logKey]: log } = await chrome.storage.local.get(logKey);
    // One write: the derived weeks and the raw log can't disagree.
    await chrome.storage.local.set({
        claudeUsage: {
            ...claudeUsage,
            [orgId]: {
                schemaVersion: SCHEMA_VERSION,
                status: { ...status, state: 'ok', fails: 0, lastSuccess: now.toISOString(), lastError: null },
                weeks,
            },
        },
        [logKey]: appendReading(log, parsed.reading),
    });
    console.log('[ACB] claude usage (%s): %s%% used', trigger, parsed.reading.util);
}
