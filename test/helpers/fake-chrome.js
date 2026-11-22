// In-memory chrome.* for tests of the imperative shells (capture, popup).
// storage.get supports every form our code uses: a key, a list of keys, an
// object of defaults, or null (everything); set() merges and notifies
// onChanged listeners like Chrome does.
import { vi } from 'vitest';

function area(name, data, listeners) {
  return {
    data,
    // Promise form, or the callback form the popup's toggles use.
    get(keys, cb) {
      let out;
      if (keys == null) out = { ...data };
      else if (typeof keys === 'string' || Array.isArray(keys)) {
        out = Object.fromEntries([].concat(keys).filter(k => k in data).map(k => [k, data[k]]));
      } else out = Object.fromEntries(Object.entries(keys).map(([k, d]) => [k, k in data ? data[k] : d]));
      out = structuredClone(out);
      if (cb) { cb(out); return undefined; }
      return Promise.resolve(out);
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = structuredClone(v);
      }
      for (const fn of listeners) fn(changes, name);
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete data[k];
    },
  };
}

export function fakeChrome({ local = {}, sync = {} } = {}) {
  const listeners = [];
  return {
    storage: {
      local: area('local', structuredClone(local), listeners),
      sync: area('sync', structuredClone(sync), listeners),
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      sendMessage: vi.fn(() => Promise.resolve()),
    },
    tabs: { query: async () => [] },
  };
}

// A fetch Response stand-in: just what the capture shell reads.
export function response(status, body, contentType = 'application/json') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => {
      if (typeof body === 'string') throw new SyntaxError('not json');
      return body;
    },
  };
}
