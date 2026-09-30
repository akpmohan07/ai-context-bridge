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
const FILL_MS = 900;
const PAUSE_MS = 250;
const UNTRACKED_MS = 600;
const DAY_MS = 500;      // a day's column and its share of the bar grow together
const EMPTY_DAY_MS = 120;
const COL_PX = 32;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let replay = null; // { skip } while a replay is running
let refreshAfterReplay = false; // a reading landed mid-replay; show it after

async function renderClaudeUsage({ animate }) {
  const { claudeOrgId, claudeUsage = {} } = await chrome.storage.local.get(['claudeOrgId', 'claudeUsage']);
  const view = usageView(claudeOrgId, claudeUsage[claudeOrgId], new Date(), formatElapsed);
  const block = document.getElementById('claudeUsage');
  const main = block.querySelector('.usage-main');
  const message = block.querySelector('.usage-message');

  message.hidden = !view.message;
  message.textContent = view.message ?? '';
  main.hidden = !!view.message;
  if (view.message) return;

  const reset = block.querySelector('.usage-reset');
  reset.replaceChildren(Object.assign(document.createElement('b'), { textContent: view.resetsIn }),
                        ` left · resets ${view.resetsAt}`);
  block.querySelector('.usage-pattern').textContent = view.pattern;
  const note = block.querySelector('.usage-note');
  note.hidden = !view.note;
  note.textContent = view.note ?? '';

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
    if (slot.untracked) { mark.textContent = '–'; el.title = `${slot.label}: before tracking started`; }
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
  // Labels sit centred over their part, kept inside the bar's ends.
  const drawBar = (capacity, used) => {
    fill.style.width = `${capacity}%`;
    usedBar.style.width = `${used}%`;
    usedLabel.textContent = `Used ${Math.round(used)}%`;
    unusedLabel.textContent = `Unused ${Math.round(Math.max(0, capacity - used))}%`;
    usedLabel.style.left = `${clamp(used / 2)}%`;
    // Centred on the unused part's final extent, so it doesn't collide with
    // "Used" while the green is still filling in.
    unusedLabel.style.left = `${clamp(used + (100 - used) / 2)}%`;
  };

  const finish = () => {
    drawBar(100, view.used);
    for (const d of days) {
      if (d.slot.untracked || d.slot.when === 'future') d.mark.style.opacity = '1';
      else drawDay(d, 1);
    }
    for (const d of days) d.el.classList.toggle('lit', d.slot.when === 'today');
    beacon.style.left = `${view.used}%`;
    beacon.hidden = view.available <= 0;
    replay = null;
    if (refreshAfterReplay) { refreshAfterReplay = false; renderClaudeUsage({ animate: false }); }
  };

  if (!animate || reduceMotion) {
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

  // Usage from before tracking: the untracked days show "–" as it flows in.
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

const clamp = (pct) => Math.min(90, Math.max(10, pct));
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
  if (area !== 'local' || !(changes.claudeUsage || changes.claudeOrgId)) return;
  if (replay) refreshAfterReplay = true;
  else renderClaudeUsage({ animate: false });
});
chrome.runtime.sendMessage({ action: 'captureClaudeUsage' }).catch(() => {});
