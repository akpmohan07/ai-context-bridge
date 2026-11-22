import { Defaults } from '../../src/core/defaults.js';
import { Theme } from '../../src/ui/theme.js';
import { usageView } from '../../src/usage/claude-usage.js';
import { formatElapsed } from '../../src/time/time-logic.js';

document.getElementById('version').textContent = 'v' + chrome.runtime.getManifest().version;

// Apply theme tokens as CSS variables
const root = document.documentElement;
root.style.setProperty('--popup-bg',           Theme.popup.bg);
root.style.setProperty('--popup-header-bg',    Theme.popup.headerBg);
root.style.setProperty('--popup-border',       Theme.popup.border);
root.style.setProperty('--popup-section-label',Theme.popup.sectionLabel);
root.style.setProperty('--popup-slider-off',   Theme.popup.sliderOff);
root.style.setProperty('--popup-slider-on',    Theme.popup.sliderOn);
root.style.setProperty('--popup-text',         Theme.ui.text);
root.style.setProperty('--popup-text-weak',    Theme.ui.textWeak);
root.style.setProperty('--popup-icon-bg',      '#ffffff');

// Section accent colors per platform
document.querySelectorAll('.section').forEach(el => {
    const color = { claude: Theme.claude.accent, chatgpt: Theme.chatgpt.accent, gemini: Theme.gemini.accent }[el.dataset.accent];
    if (color) el.style.setProperty('--accent', color); // "Sources" keeps the muted grey
});

// Put the section for the tab you're on first (chatgpt.com → ChatGPT on top).
// Sources otherwise stays last.
(async () => {
    const body = document.querySelector('.body');
    const order = ['claude', 'chatgpt', 'gemini', 'sources'];
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const host = tab?.url ? new URL(tab.url).hostname : '';
        const top = host.endsWith('claude.ai') ? 'claude'
                  : host.endsWith('chatgpt.com') ? 'chatgpt'
                  : host.endsWith('gemini.google.com') ? 'gemini'
                  : (host.endsWith('reddit.com') || host.endsWith('medium.com')) ? 'sources'
                  : null;
        if (top) order.unshift(...order.splice(order.indexOf(top), 1));
    } catch { /* no tabs permission / no active tab — default order */ }
    for (const s of order) body.appendChild(body.querySelector(`[data-section="${s}"]`));
})();

// Which toggles this popup renders — each id is both the storage key and the
// checkbox's element id. Defaults come from src/core/defaults.js.
const TOGGLES = [
    'redditEnabled', 'mediumEnabled',
    'claudeTimerEnabled', 'soundsEnabled',
    'chatgptTimerEnabled', 'chatgptEnabled',
    'geminiTimerEnabled',
    'claudeUsageEnabled',
];
const DEFAULTS = Object.fromEntries(TOGGLES.map(k => [k, Defaults[k]]));

chrome.storage.sync.get(DEFAULTS, (result) => {
  for (const key of Object.keys(DEFAULTS)) {
    document.getElementById(key).checked = result[key];
  }
});

for (const key of Object.keys(DEFAULTS)) {
  document.getElementById(key).addEventListener('change', (e) => {
    chrome.storage.sync.set({ [key]: e.target.checked });
  });
}

const modelSelect = document.getElementById('preferredClaudeModel');

(async () => {
  // Rebuild options from the live catalog cached by the claude content script.
  const { availableClaudeModels } = await chrome.storage.local.get({
    availableClaudeModels: Defaults.availableClaudeModels
  });
  if (availableClaudeModels?.length) {
    modelSelect.innerHTML = '';
    const noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = 'Default';
    modelSelect.appendChild(noneOption);
    for (const model of availableClaudeModels) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      option.disabled = !!model.disabled_reason;
      modelSelect.appendChild(option);
    }
  }

  const { preferredClaudeModel } = await chrome.storage.sync.get({
    preferredClaudeModel: Defaults.preferredClaudeModel
  });
  modelSelect.value = preferredClaudeModel;
})();

modelSelect.addEventListener('change', (e) => {
  chrome.storage.sync.set({ preferredClaudeModel: e.target.value });
});

// Weekly usage (#27): rendered from what the background capture stored. The
// bar is the week's capacity (blue used, green unused); the strip under it is
// the days the blue came from. Every open replays the week: the green fills
// in (a fresh week), then untracked usage flows into the bar, then day by day
// each column grows together with its share of the bar, ending on today with a beacon
// on what's still unused. One frame loop drives bar, labels and columns so
// they can't drift apart. Click skips; reduced-motion shows the end state.
// Opening the popup also asks for a fresh reading (throttled in the
// background); if one lands mid-replay it's shown once the replay ends.
// History opens week chips that switch to a past week, drawn without a replay: grey
// where capacity expired instead of green.
const FILL_MS = 900;
const PAUSE_MS = 250;
const UNTRACKED_MS = 600;
const DAY_MS = 500;      // a day's column and its share of the bar grow together
const EMPTY_DAY_MS = 120;
const COL_PX = 18;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let replay = null; // { skip } while a replay is running
let refreshAfterReplay = false; // a reading landed mid-replay; show it after
let selectedWeek = null; // weekStart of the chip picked; null = current week

async function renderClaudeUsage({ animate }) {
  const block = document.getElementById('claudeUsage');
  // Usage Tracking off: no block at all, just the toggle row under it.
  const { claudeUsageEnabled } = await chrome.storage.sync.get({ claudeUsageEnabled: Defaults.claudeUsageEnabled });
  block.hidden = !claudeUsageEnabled;
  if (!claudeUsageEnabled) { replay?.skip(); return; }
  const { claudeOrgId, claudeUsage = {} } = await chrome.storage.local.get(['claudeOrgId', 'claudeUsage']);
  const view = usageView(claudeOrgId, claudeUsage[claudeOrgId], new Date(), formatElapsed, selectedWeek);
  const main = block.querySelector('.usage-main');
  const message = block.querySelector('.usage-message');

  message.hidden = !view.message;
  message.textContent = view.message ?? '';
  main.hidden = !!view.message;
  if (view.message) return;

  block.classList.toggle('past', view.past);
  renderWeekChips(block.querySelector('.usage-weeks-nav'), view);

  const bold = (text) => Object.assign(document.createElement('b'), { textContent: text });
  const eff = block.querySelector('.usage-eff');
  if (view.efficiency.pct === null) eff.replaceChildren(view.efficiency.text);
  else eff.replaceChildren(bold(`${view.efficiency.pct}%`), ` ${view.efficiency.text}`);
  const note = block.querySelector('.usage-note');
  note.hidden = !view.note;
  note.textContent = view.note ?? '';

  // Rings: the session is always the current one; the week ring follows the
  // selected week and is drawn by drawBar below.
  const sessionRing = block.querySelector('.usage-ring-item.session');
  const weekRing = block.querySelector('.usage-ring-item.week');
  sessionRing.hidden = !view.session;
  if (view.session) {
    setRing(sessionRing, view.session.used);
    setRingText(sessionRing, 'Session', view.session.resetsIn ? `resets in ${view.session.resetsIn}` : 'not started');
  }
  if (view.past) {
    const label = view.weeks.find(w => w.weekStart === view.weekStart)?.label ?? 'Past week';
    setRingText(weekRing, label, `${view.available}% expired unused`);
  } else {
    setRingText(weekRing, 'This week', `resets ${view.resetsAt}`);
  }
  weekRing.title = view.past ? '' : `${view.resetsIn} left`;

  const fill = block.querySelector('.usage-fill');
  const usedBar = block.querySelector('.usage-used');
  const usedLabel = block.querySelector('.usage-pop.used');
  const unusedLabel = block.querySelector('.usage-pop.unused');
  const beacon = block.querySelector('.usage-beacon');
  const { slots, untracked } = view.strip;

  // The strip: one column per day, scaled to the week's busiest tracked day.
  const maxDay = Math.max(0, ...slots.map(d => d.used ?? 0));
  const days = slots.map(slot => {
    const el = document.createElement('div');
    el.className = `strip-day ${slot.when}`;
    el.innerHTML = '<div class="strip-col"><div class="strip-fill"></div><span class="strip-mark"></span></div>'
                 + '<div class="strip-val"></div><div class="strip-label"></div>';
    el.querySelector('.strip-label').textContent = slot.when === 'today' ? 'Today' : slot.label;
    const mark = el.querySelector('.strip-mark');
    if (slot.untracked) { mark.textContent = '–'; el.title = `${slot.label}: not tracked (no readings that day)`; }
    else if (slot.when === 'future') { mark.textContent = '·'; el.title = `${slot.label}: ahead`; }
    else el.title = `${slot.label}: ${Math.round(slot.used)}% of your week`;
    return { slot, el, fill: el.querySelector('.strip-fill'), val: el.querySelector('.strip-val'), mark };
  });
  block.querySelector('.usage-strip').replaceChildren(...days.map(d => d.el));

  const colPx = (used) => (used > 0 && maxDay > 0 ? Math.max(2, (used / maxDay) * COL_PX) : 0);
  const drawDay = (d, k) => {
    d.fill.style.height = `${colPx(d.slot.used) * k}px`;
    d.val.textContent = k > 0 ? `${Math.round(d.slot.used * k)}%` : '';
  };

  // Draw the bar at one moment: `capacity` % filled green, `used` % blue.
  // The week ring and the legend under the bar follow it.
  const drawBar = (capacity, used) => {
    fill.style.width = `${capacity}%`;
    usedBar.style.width = `${used}%`;
    setRing(weekRing, used);
    usedLabel.textContent = `${Math.round(used)}% used`;
    unusedLabel.textContent = `${Math.round(Math.max(0, capacity - used))}% ${view.past ? 'expired' : 'unused'}`;
  };

  const finish = () => {
    drawBar(100, view.used);
    for (const d of days) {
      if (d.slot.untracked || d.slot.when === 'future') d.mark.style.opacity = '1';
      else drawDay(d, 1);
    }
    for (const d of days) d.el.classList.toggle('lit', d.slot.when === 'today');
    beacon.style.left = `${view.used}%`;
    beacon.hidden = view.past || view.available <= 0;
    replay = null;
    if (refreshAfterReplay) { refreshAfterReplay = false; renderClaudeUsage({ animate: false }); }
  };

  if (!animate || reduceMotion || view.past) {
    finish();
    return;
  }

  let skipped = false;
  replay = { skip: () => { skipped = true; finish(); } };
  const stop = () => skipped;
  beacon.hidden = true;
  for (const d of days) {
    drawDay(d, 0);
    if (d.slot.untracked) { d.mark.classList.add('strip-fade'); d.mark.style.opacity = '0'; }
  }

  // A fresh week: the capacity fills in.
  drawBar(0, 0);
  await tween(FILL_MS, k => drawBar(100 * k, 0), stop);
  await sleep(PAUSE_MS);
  if (skipped) return;

  // Usage with no known day: the untracked days show "–" as it flows in.
  let used = 0;
  if (untracked > 0) {
    for (const d of days) if (d.slot.untracked) d.mark.style.opacity = '1';
    await tween(UNTRACKED_MS, k => drawBar(100, untracked * k), stop);
    used = untracked;
  }

  // Then each tracked day: its column and its share of the bar grow together.
  for (const d of days) {
    if (skipped) return;
    if (d.slot.untracked || d.slot.when === 'future') continue;
    if (!(d.slot.used > 0)) { drawDay(d, 1); await sleep(EMPTY_DAY_MS); continue; }
    const from = used;
    await tween(DAY_MS, k => { drawDay(d, k); drawBar(100, from + d.slot.used * k); }, stop);
    used += d.slot.used;
  }
  if (!skipped) finish();
}

// One chip per stored week, newest first, labelled with its dates and shaded
// up to its used %, so the row also reads as a trend. Behind the History
// toggle, which shows once there's a second week to switch to.
let historyOpen = false;

function renderWeekChips(nav, view) {
  const toggle = document.querySelector('.usage-history');
  toggle.hidden = view.weeks.length < 2;
  nav.hidden = toggle.hidden || !historyOpen;
  if (toggle.hidden) return;
  const row = nav.querySelector('.usage-weeks');
  row.replaceChildren(...view.weeks.map(week => {
    const chip = document.createElement('button');
    const selected = week.weekStart === view.weekStart;
    chip.className = `usage-chip${selected ? ' selected' : ''}`;
    chip.setAttribute('role', 'tab');
    chip.setAttribute('aria-selected', String(selected));
    chip.title = `${week.current ? 'This week' : week.label}: ${Math.round(week.used)}% used`;
    chip.style.setProperty('--chip-used', `${week.used}%`);
    chip.textContent = week.label;
    chip.addEventListener('click', (e) => {
      e.stopPropagation(); // the block's click skips the replay
      replay?.skip();
      selectedWeek = week.current ? null : week.weekStart;
      renderClaudeUsage({ animate: false });
    });
    return chip;
  }));
  showSelectedChip(nav);
}

// Scroll the selected chip into view (only possible while the row is shown).
function showSelectedChip(nav) {
  if (nav.hidden) return;
  nav.querySelector('.selected')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateWeekArrows(nav);
}

// Show an arrow only when there are chips hidden that way.
function updateWeekArrows(nav) {
  const row = nav.querySelector('.usage-weeks');
  const max = row.scrollWidth - row.clientWidth;
  nav.querySelector('.prev').hidden = row.scrollLeft <= 1;
  nav.querySelector('.next').hidden = row.scrollLeft >= max - 1;
}

{
  const nav = document.querySelector('.usage-weeks-nav');
  const row = nav.querySelector('.usage-weeks');
  row.addEventListener('scroll', () => updateWeekArrows(nav), { passive: true });
  for (const [cls, dir] of [['prev', -1], ['next', 1]]) {
    nav.querySelector(`.${cls}`).addEventListener('click', (e) => {
      e.stopPropagation(); // the block's click skips the replay
      row.scrollBy({ left: dir * row.clientWidth * 0.7 });
    });
  }
  const toggle = document.querySelector('.usage-history');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation(); // the block's click skips the replay
    historyOpen = !historyOpen;
    toggle.setAttribute('aria-expanded', String(historyOpen));
    toggle.textContent = historyOpen ? 'History ▴' : 'History ▾';
    nav.hidden = !historyOpen;
    showSelectedChip(nav);
  });
}

function setRing(item, pct) {
  item.querySelector('.usage-ring').style.setProperty('--pct', String(pct));
  item.querySelector('.usage-ring-val').textContent = `${Math.round(pct)}%`;
}

function setRingText(item, title, sub) {
  item.querySelector('.usage-ring-title').textContent = title;
  item.querySelector('.usage-ring-sub').textContent = sub;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Run onFrame(k) with k eased 0 → 1 over ms (ease-out cubic), stopping early
// if cancelled.
function tween(ms, onFrame, cancelled) {
  return new Promise(resolve => {
    const start = performance.now();
    const tick = (t) => {
      if (cancelled()) return resolve();
      const k = Math.min(1, (t - start) / ms);
      onFrame(1 - (1 - k) ** 3);
      if (k < 1) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
}

document.getElementById('claudeUsage').addEventListener('click', () => replay?.skip());
renderClaudeUsage({ animate: true });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.claudeUsageEnabled) {
    // Turned back on: show what's stored now and ask for a fresh reading.
    if (changes.claudeUsageEnabled.newValue) chrome.runtime.sendMessage({ action: 'captureClaudeUsage' }).catch(() => {});
    renderClaudeUsage({ animate: false });
    return;
  }
  if (area !== 'local' || !(changes.claudeUsage || changes.claudeOrgId)) return;
  if (replay) refreshAfterReplay = true;
  else renderClaudeUsage({ animate: false });
});
chrome.runtime.sendMessage({ action: 'captureClaudeUsage' }).catch(() => {});
