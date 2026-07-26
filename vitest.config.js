const { defineConfig } = require('vitest/config');

// Pure JS extension, no build — source files are browser-global IIFEs that add a
// CommonJS export guard at the bottom (skipped in the browser). Vitest imports
// them via that guard. Coverage is scoped to the *pure* logic only; the DOM/
// chrome glue is E2E's job and would just dilute the number.
module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/core/budget.js',
        'src/core/formatter.js',
        'src/core/schema.js',
        'src/time/message-timer.js',
        'src/presence/state-machine.js',
      ],
    },
  },
});
