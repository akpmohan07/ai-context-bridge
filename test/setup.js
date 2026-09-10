// jsdom doesn't implement matchMedia; theme.js reads it at import time.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
}

// Minimal chrome stub for modules that touch storage. get() supports both the
// callback and promise forms our code uses, and just echoes the requested
// defaults back (i.e. "empty storage → defaults apply").
globalThis.chrome = globalThis.chrome || {
  storage: {
    sync:  { get: (defaults, cb) => (cb ? cb(defaults) : Promise.resolve(defaults)), set: () => {} },
    local: {
      get: (defaults, cb) => {
        // string/array form ("just the key(s)") → no defaults to echo back
        const val = (typeof defaults === 'string' || Array.isArray(defaults)) ? {} : defaults;
        return cb ? cb(val) : Promise.resolve(val);
      },
      set: () => {},
      remove: () => {},
    },
    onChanged: { addListener: () => {} },
  },
};
