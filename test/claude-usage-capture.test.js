// The capture shell (#27, #37): chrome.storage and fetch are faked in memory,
// so these check what actually gets requested and written — the toggle gate,
// org discovery, the schema upgrade, logged-out backoff and throttling. The
// decisions themselves are unit-tested in claude-usage.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { captureClaudeUsage } from '../src/usage/claude-usage-capture.js';
import { readingsKey } from '../src/usage/claude-usage.js';
import { fakeChrome, response } from './helpers/fake-chrome.js';

const NOW = new Date('2026-11-22T15:00:00Z');
const ORG = 'org-1';
const WEEK = '2026-11-15T17:00:00.000Z';
const RESET = '2026-11-22T17:00:00.000Z';
const USAGE_URL = (org) => `https://claude.ai/api/organizations/${org}/usage`;
const ORGS_URL = 'https://claude.ai/api/organizations';
const LOG = readingsKey(ORG, WEEK);

// Trimmed from a real /usage response.
const usage = (weekly = 36, session = 60) => ({
  five_hour: { utilization: session, resets_at: '2026-11-22T17:00:00.304068+00:00' },
  seven_day: { utilization: weekly, resets_at: '2026-11-22T16:59:59.789532+00:00' },
  limits: [
    { kind: 'session', percent: session, resets_at: '2026-11-22T17:00:00.304068+00:00' },
    { kind: 'weekly_all', percent: weekly, resets_at: '2026-11-22T16:59:59.789532+00:00' },
  ],
  seven_day_breakdown: { as_of: NOW.toISOString(), window_started_at: '2026-11-15T16:59:59.789532+00:00' },
});
const loggedOut = { error: { details: { error_code: 'account_session_invalid' } } };

let chrome;
let fetch;
// url → response (or a function returning one)
function route(routes) {
  fetch.mockImplementation(async (url) => {
    const r = routes[url];
    if (!r) throw new Error(`unexpected fetch ${url}`);
    return typeof r === 'function' ? r() : r;
  });
}
const account = (org = ORG) => chrome.storage.local.data.claudeUsage?.[org];
const urls = () => fetch.mock.calls.map(([url]) => url);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  chrome = fakeChrome({ local: { claudeOrgId: ORG } });
  fetch = vi.fn();
  vi.stubGlobal('chrome', chrome);
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('captureClaudeUsage', () => {
  it('makes no request while Usage Tracking is off', async () => {
    chrome.storage.sync.data.claudeUsageEnabled = false;
    await captureClaudeUsage('alarm');
    expect(fetch).not.toHaveBeenCalled();
    expect(account()).toBeUndefined();
  });

  it('stores the week, the session and the raw reading on success', async () => {
    route({ [USAGE_URL(ORG)]: response(200, usage()) });
    await captureClaudeUsage('alarm');

    expect(account()).toMatchObject({
      schemaVersion: 2,
      status: { state: 'ok', fails: 0, lastSuccess: NOW.toISOString(), lastError: null },
      weeks: { [WEEK]: { weekReset: RESET, used: 36, lastReadingAt: NOW.toISOString() } },
      session: { util: 60, resetsAt: RESET, asOf: NOW.toISOString() },
    });
    expect(chrome.storage.local.data[LOG]).toEqual([[NOW.getTime() / 1000, 36]]);
  });

  it('finds the org from /api/organizations when claude.ai was never opened', async () => {
    delete chrome.storage.local.data.claudeOrgId;
    route({
      [ORGS_URL]: response(200, [
        { uuid: 'personal', capabilities: ['api'] },
        { uuid: ORG, capabilities: ['chat'] },
      ]),
      [USAGE_URL(ORG)]: response(200, usage()),
    });
    await captureClaudeUsage('startup');
    expect(chrome.storage.local.data.claudeOrgId).toBe(ORG);
    expect(account().weeks[WEEK].used).toBe(36);
  });

  it('does nothing without an org (logged out, never used Claude)', async () => {
    delete chrome.storage.local.data.claudeOrgId;
    route({ [ORGS_URL]: response(403, loggedOut) });
    await captureClaudeUsage('startup');
    expect(urls()).toEqual([ORGS_URL]);
    expect(chrome.storage.local.data.claudeUsage).toBeUndefined();
  });

  it('re-discovers the org when the cached one 404s', async () => {
    route({
      [USAGE_URL(ORG)]: response(404, { error: {} }),
      [ORGS_URL]: response(200, [{ uuid: 'org-2', capabilities: ['chat'] }]),
      [USAGE_URL('org-2')]: response(200, usage()),
    });
    await captureClaudeUsage('alarm');
    expect(chrome.storage.local.data.claudeOrgId).toBe('org-2');
    expect(account('org-2').weeks[WEEK].used).toBe(36);
    expect(account(ORG)).toBeUndefined();
  });

  it('upgrades a schema-1 account by rebuilding its days from the raw log', async () => {
    const at = (iso) => Date.parse(iso) / 1000;
    chrome.storage.local.data.claudeUsage = {
      [ORG]: {
        schemaVersion: 1,
        status: { state: 'ok' },
        weeks: { [WEEK]: { weekReset: RESET, used: 30, lastReadingAt: '2026-11-22T14:40:00.000Z', days: {} } },
      },
    };
    chrome.storage.local.data[LOG] = [[at('2026-11-22T14:30:00Z'), 20], [at('2026-11-22T14:40:00Z'), 30]];
    route({ [USAGE_URL(ORG)]: response(200, usage(36)) });

    await captureClaudeUsage('installed');

    const week = account().weeks[WEEK];
    expect(account().schemaVersion).toBe(2);
    expect(week.used).toBe(36);
    // 14:30→14:40 adds 10, 14:40→15:00 adds 6; the first reading has no
    // previous one, so its 20 stays untracked.
    expect(Object.values(week.days).reduce((a, b) => a + b, 0)).toBe(16);
    expect(chrome.storage.local.data[LOG]).toHaveLength(3);
  });

  it('marks a logged-out account and backs off background captures', async () => {
    route({ [USAGE_URL(ORG)]: response(403, loggedOut) });
    await captureClaudeUsage('alarm');
    expect(account().status).toMatchObject({ state: 'logged_out', fails: 1, lastError: { code: 403, detail: 'account_session_invalid' } });

    // Within the 5-min backoff: the timer skips, opening claude.ai still tries.
    vi.setSystemTime(new Date(NOW.getTime() + 2 * 60 * 1000));
    await captureClaudeUsage('alarm');
    expect(fetch).toHaveBeenCalledTimes(1);
    await captureClaudeUsage('claude.ai opened', { source: 'page' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(account().status.fails).toBe(2);
  });

  it("treats Cloudflare's 403 page as a transient error and keeps the last data", async () => {
    route({ [USAGE_URL(ORG)]: response(200, usage()) });
    await captureClaudeUsage('alarm');
    route({ [USAGE_URL(ORG)]: response(403, '<html>', 'text/html; charset=UTF-8') });
    vi.setSystemTime(new Date(NOW.getTime() + 5 * 60 * 1000));
    await captureClaudeUsage('alarm');

    expect(account().status).toMatchObject({ state: 'error', fails: 0, lastError: { code: 403, detail: 'html' } });
    expect(account().weeks[WEEK].used).toBe(36);
    expect(account().session.util).toBe(60);
  });

  it('records a network failure as an error', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await captureClaudeUsage('alarm');
    expect(account().status).toMatchObject({ state: 'error', lastError: { code: 'network' } });
  });

  it('throttles page-triggered captures to one a minute', async () => {
    route({ [USAGE_URL(ORG)]: response(200, usage()) });
    await captureClaudeUsage('claude.ai opened', { source: 'page' });
    vi.setSystemTime(new Date(NOW.getTime() + 30 * 1000));
    await captureClaudeUsage('claude.ai opened', { source: 'page' });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date(NOW.getTime() + 61 * 1000));
    await captureClaudeUsage('claude.ai opened', { source: 'page' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('flags a response it cannot read as broken', async () => {
    route({ [USAGE_URL(ORG)]: response(200, { unexpected: true }) });
    await captureClaudeUsage('alarm');
    expect(account().status).toMatchObject({ state: 'broken', lastError: { code: 'shape' } });
  });
});
