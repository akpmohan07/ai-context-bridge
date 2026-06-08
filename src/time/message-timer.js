const MessageTimer = (() => {
    const THRESHOLD_MS = 30 * 60 * 1000;

    function formatElapsed(ms) {
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        if (d > 0) return h > 0 ? `${d} day${d>1?'s':''} ${h}h` : `${d} day${d>1?'s':''}`;
        if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
        return `${m} min`;
    }

    function formatNow() {
        return new Date().toLocaleString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long',
            day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

    function parseSpanText(text) {
        const t = text.trim();
        // "01:08" → today at that time
        const timeMatch = t.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const d = new Date();
            d.setHours(+timeMatch[1], +timeMatch[2], 0, 0);
            return d;
        }
        // "29 May" → that date at midnight
        const dateMatch = t.match(/^(\d{1,2})\s+(\w{3})$/);
        if (dateMatch) {
            const month = MONTHS[dateMatch[2]];
            if (month === undefined) return null;
            const d = new Date();
            d.setMonth(month, +dateMatch[1]);
            d.setHours(0, 0, 0, 0);
            if (d > new Date()) d.setFullYear(d.getFullYear() - 1);
            return d;
        }
        return null;
    }

    function getLastMessageTime() {
        const spans = document.querySelectorAll('span.text-text-500.text-xs');
        if (!spans.length) return null;
        return parseSpanText(spans[spans.length - 1].textContent);
    }

    function buildPrefix() {
        const now = new Date();
        const lastTime = getLastMessageTime();
        const elapsed = lastTime ? now - lastTime : null;
        const timeStr = formatNow();
        if (elapsed && elapsed >= THRESHOLD_MS) {
            return `[TimeContext: ${timeStr} | ${formatElapsed(elapsed)} since last message]\n`;
        }
        if (!lastTime) {
            return `[TimeContext: ${timeStr}]\n`;
        }
        return null;
    }

    function prependToInput(text) {
        const inputBox = document.querySelector('div[contenteditable="true"]');
        if (!inputBox || !inputBox.innerText.trim()) return;
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(inputBox, 0);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, text);
    }

    let _enabled = true;

    function setEnabled(val) { _enabled = val; }

    function init() {
        console.log('[MessageTimer] init');
        let injecting = false;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button[aria-label="Send message"]');
            if (!btn || injecting || !_enabled) return;
            const prefix = buildPrefix();
            console.log('[MessageTimer] click — prefix:', prefix);
            if (!prefix) return;
            e.preventDefault();
            e.stopPropagation();
            prependToInput(prefix);
            injecting = true;
            setTimeout(() => { btn.click(); injecting = false; }, 0);
        }, true);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.shiftKey || injecting || !_enabled) return;
            if (!e.target.closest('[data-testid="chat-input"]')) return;
            const prefix = buildPrefix();
            console.log('[MessageTimer] enter — prefix:', prefix);
            if (!prefix) return;
            e.preventDefault();
            e.stopPropagation();
            prependToInput(prefix);
            injecting = true;
            setTimeout(() => {
                const btn = document.querySelector('button[aria-label="Send message"]');
                if (btn) btn.click();
                injecting = false;
            }, 0);
        }, true);
    }

    return { init, setEnabled };
})();
