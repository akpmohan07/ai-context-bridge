// Shared usage scheduler (#27): one background timer drives every platform's
// usage capture. Each platform owns its fetch, parsing and storage key
// (claudeUsage, …) because platforms measure usage differently; this file only
// decides when they run.
import { captureClaudeUsage } from './claude-usage-capture.js';

export const USAGE_ALARM = 'usage-capture';
// 5 min keeps day attribution tight around midnight and gaps easy to spot.
const CAPTURE_EVERY_MIN = 5;

const PLATFORMS = {
    claude: captureClaudeUsage,
};

// Serialize captures so two triggers can't interleave read-modify-write.
let chain = Promise.resolve();

export function scheduleUsageCapture() {
    chrome.alarms.create(USAGE_ALARM, { periodInMinutes: CAPTURE_EVERY_MIN });
}

// Capture every platform, or just `only`. One platform failing never stops the
// others.
export function captureUsage(trigger, { only, source } = {}) {
    const names = only ? [only] : Object.keys(PLATFORMS);
    chain = chain.then(async () => {
        for (const name of names) {
            try {
                await PLATFORMS[name](trigger, { source });
            } catch (e) {
                console.warn('[ACB] %s usage (%s): unexpected failure', name, trigger, e);
            }
        }
    });
    return chain;
}
