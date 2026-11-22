const { defineConfig } = require('vitest/config');

// Functional core / imperative shell: coverage is scoped to the *pure* modules
// where a file-level % is meaningful. The DOM/chrome/fetch glue (reddit.js,
// medium.js, message-timer.js, the UI injectors) is the imperative shell —
// exercised by E2E, not counted here, so it can't dilute the number. Each glue
// file's pure logic has been extracted into a sibling module below and is unit-
// tested directly.
module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/core/budget.js',
        'src/core/formatter.js',
        'src/core/schema.js',
        'src/presence/state-machine.js',
        'src/ai-platforms/gemini.js',
        'src/content-sources/reddit-parse.js',
        'src/content-sources/medium-markdown.js',
        'src/time/time-logic.js',
        'src/usage/claude-usage.js',
        'src/ui/menu-item.js',
      ],
      // Merge gate (CI `unit`, #37): the run fails if coverage drops below
      // these floors, set just under today's numbers. Raise them as coverage
      // grows; lowering one should be a deliberate, reviewed change.
      thresholds: {
        statements: 95,
        branches: 92,
        functions: 92,
        lines: 95,
        // Usage tracking is the newest and most stateful logic: keep it
        // near-complete.
        'src/usage/**': { statements: 99, branches: 93, functions: 100, lines: 100 },
      },
    },
  },
});
