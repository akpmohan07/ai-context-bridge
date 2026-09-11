// Pure time-context logic — no chrome/DOM/fetch. The imperative shell that
// wires this into send interception + the seed APIs lives in message-timer.js.

export const THRESHOLD_MS = 30 * 60 * 1000;

export function formatElapsed(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (d > 0) return h > 0 ? `${d} day${d>1?'s':''} ${h}h` : `${d} day${d>1?'s':''}`;
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    if (m > 0) return `${m} min`;
    // Unreachable with the real 30-min THRESHOLD_MS, but the tests (and manual
    // testing) lower it to seconds — don't render "0 min" there.
    return 'less than a minute';
}

export function formatNow(d = new Date()) {
    return d.toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long',
        day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

// Given the last-message time (Date|null) and now, decide the prefix (or null
// during an active chat).
export function buildPrefix(lastTime, now = new Date()) {
    const elapsed = lastTime ? now - lastTime : null;
    const timeStr = formatNow(now);
    if (elapsed && elapsed >= THRESHOLD_MS) {
        return `[TimeContext: ${timeStr} | ${formatElapsed(elapsed)} since last message]\n`;
    }
    if (!lastTime) {
        return `[TimeContext: ${timeStr}]\n`;
    }
    return null;
}

// Claude conversation history → last-message epoch ms. Max message created_at,
// falling back to the conversation updated_at.
export function parseClaudeLastTime(data) {
    let max = 0;
    for (const m of data?.chat_messages || []) {
        const t = Date.parse(m?.created_at);
        if (t && t > max) max = t;
    }
    if (!max && data?.updated_at) max = Date.parse(data.updated_at) || 0;
    return max || null;
}

// ChatGPT conversation history → last-message epoch ms. Max create_time
// (seconds) → ms.
export function parseChatgptLastTime(data) {
    const mapping = data?.mapping;
    if (!mapping) return null;
    let max = 0;
    for (const k in mapping) {
        const t = mapping[k]?.message?.create_time;
        if (typeof t === 'number' && t > max) max = t;
    }
    return max ? max * 1000 : null;
}
