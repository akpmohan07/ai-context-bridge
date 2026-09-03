// Turns playwright-report/results.json (the 'json' reporter output — see
// playwright.config.ts) into a markdown table for the GitHub Actions run
// summary, so the readable result lives on the run page itself instead of
// requiring a download of the HTML report artifact.
import { readFileSync, appendFileSync } from 'node:fs';

const STATUS_ICON = {
  expected: '✅',
  unexpected: '❌',
  flaky: '⚠️',
  skipped: '⏭️',
};

function collectSpecs(suite, out) {
  for (const spec of suite.specs ?? []) {
    const test = spec.tests[0];
    const durationMs = test.results.reduce((sum, r) => sum + r.duration, 0);
    out.push({
      file: spec.file,
      title: spec.title,
      status: test.status,
      durationMs,
    });
  }
  for (const child of suite.suites ?? []) collectSpecs(child, out);
}

const report = JSON.parse(readFileSync('playwright-report/results.json', 'utf8'));
const rows = [];
for (const suite of report.suites) collectSpecs(suite, rows);

const { expected, unexpected, flaky, skipped } = report.stats;
const totalSec = (report.stats.duration / 1000).toFixed(1);

const lines = [
  '## E2E results',
  '',
  `${expected} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped — ${totalSec}s`,
  '',
  '| | Spec | Test | Duration |',
  '|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${STATUS_ICON[r.status] ?? r.status} | ${r.file} | ${r.title} | ${(r.durationMs / 1000).toFixed(1)}s |`
  ),
  '',
];

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  appendFileSync(summaryFile, lines.join('\n') + '\n');
} else {
  console.log(lines.join('\n'));
}
