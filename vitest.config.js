const { defineConfig } = require('vitest/config');

// Pure JS extension, no build — source files are browser-global IIFEs that add a
// CommonJS export guard at the bottom (skipped in the browser). Vitest imports
// them via that guard. Coverage is scoped to the *pure* logic only; the DOM/
// chrome glue is E2E's job and would just dilute the number.
module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scoped to predominantly-pure modules where a file-level % is meaningful.
      // reddit.js / medium.js / claude.js are mostly DOM/injection glue with a
      // few pure methods — those methods ARE tested (reddit/medium/platforms
      // specs), but including the whole glue file makes the number meaningless.
      // The honest fix is extracting their pure logic into its own module; until
      // then they're covered by passing tests, not by the coverage denominator.
      include: [
        'src/core/budget.js',
        'src/core/formatter.js',
        'src/core/schema.js',
        'src/presence/state-machine.js',
        'src/ai-platforms/gemini.js',
      ],
    },
  },
});
