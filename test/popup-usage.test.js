// The popup's Claude usage block (#27, #37): the real popup HTML and main.js
// in jsdom over a fake chrome, checking the Usage Tracking toggle and what the
// block renders from stored data. Reduced motion is on so the replay draws
// its end state at once.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeChrome } from './helpers/fake-chrome.js';
import { formatWeekRange } from '../src/usage/claude-usage.js';

const html = readFileSync(resolve(__dirname, '../entrypoints/popup/index.html'), 'utf8');
const bodyHtml = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script[\s\S]*?<\/script>/g, '');

const NOW = new Date('2026-11-22T15:00:00Z');
const ORG = 'org-1';
const WEEK = '2026-11-15T17:00:00.000Z';
const PREV = '2026-11-08T17:00:00.000Z';
const stored = {
  claudeOrgId: ORG,
  claudeUsage: {
    [ORG]: {
      schemaVersion: 2,
      status: { state: 'ok', lastSuccess: NOW.toISOString() },
      session: { util: 61, resetsAt: '2026-11-22T16:51:00.000Z', asOf: NOW.toISOString() },
      weeks: {
        [PREV]: { weekReset: WEEK, used: 50, lastReadingAt: WEEK, days: {} },
        [WEEK]: { weekReset: '2026-11-22T17:00:00.000Z', used: 36, lastReadingAt: NOW.toISOString(), days: {} },
      },
    },
  },
};

let chrome;
const $ = (sel) => document.querySelector(sel);

async function openPopup({ sync = {} } = {}) {
  chrome = fakeChrome({ local: stored, sync });
  vi.stubGlobal('chrome', chrome);
  document.body.innerHTML = bodyHtml;
  await import('../entrypoints/popup/main.js');
  // Let the async render (storage reads) settle.
  await vi.waitFor(() => expect($('#claudeUsage').hidden || !$('.usage-main').hidden).toBe(true));
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  Element.prototype.scrollIntoView ??= () => {}; // not in jsdom
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('popup usage block', () => {
  it('shows the session and week rings from stored data', async () => {
    await openPopup();
    expect($('#claudeUsage').hidden).toBe(false);
    expect($('.usage-ring-item.session').hidden).toBe(false);
    expect($('.usage-ring-item.session .usage-ring-val').textContent).toBe('61%');
    expect($('.usage-ring-item.session .usage-ring-sub').textContent).toBe('resets in 1h 51m');
    expect($('.usage-ring-item.week .usage-ring-val').textContent).toBe('36%');
    expect($('.usage-pop.unused').textContent).toBe('64% unused');
    expect($('#claudeUsageEnabled').checked).toBe(true);
  });

  it('keeps the week chips behind History until it is opened', async () => {
    await openPopup();
    const toggle = $('.usage-history');
    expect(toggle.hidden).toBe(false);
    expect($('.usage-weeks-nav').hidden).toBe(true);
    toggle.click();
    expect($('.usage-weeks-nav').hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect([...document.querySelectorAll('.usage-chip')].map(c => c.textContent)).toEqual([formatWeekRange(WEEK, '2026-11-22T17:00:00.000Z'), formatWeekRange(PREV, WEEK)]);
  });

  it('hides the block while Usage Tracking is off', async () => {
    await openPopup({ sync: { claudeUsageEnabled: false } });
    expect($('#claudeUsage').hidden).toBe(true);
    expect($('#claudeUsageEnabled').checked).toBe(false);
  });

  it('turning Usage Tracking on shows the block and asks for a reading', async () => {
    await openPopup({ sync: { claudeUsageEnabled: false } });
    chrome.runtime.sendMessage.mockClear();
    const box = $('#claudeUsageEnabled');
    box.checked = true;
    box.dispatchEvent(new Event('change'));

    await vi.waitFor(() => expect($('#claudeUsage').hidden).toBe(false));
    expect(chrome.storage.sync.data.claudeUsageEnabled).toBe(true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'captureClaudeUsage' });
  });

  it('turning it off hides the block', async () => {
    await openPopup();
    const box = $('#claudeUsageEnabled');
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect($('#claudeUsage').hidden).toBe(true));
  });
});
