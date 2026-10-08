#!/usr/bin/env node
// Lint ratchet. Runs ESLint over the repository and compares the error count with the committed baseline in
// .lint-baseline.json. The run fails when the count rises; it never fails because the count fell. To lower the
// baseline after fixing problems, run with --update.
//
//   node scripts/lint-baseline.mjs            check against .lint-baseline.json (exit 1 when errors increased)
//   node scripts/lint-baseline.mjs --update   rewrite .lint-baseline.json with the current counts
//
// The baseline file is small and reviewable: {"errors": N, "warnings": M, "updatedAt": "YYYY-MM-DD"}.
// Only `errors` gates the run; `warnings` is recorded for visibility.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const baselinePath = resolve(root, '.lint-baseline.json');
const update = process.argv.includes('--update');
const eslintBin = resolve(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');

if (!existsSync(eslintBin)) {
  console.error('eslint is not installed in node_modules; install dependencies first.');
  process.exit(2);
}

const run = spawnSync(eslintBin, ['.', '--format', 'json', '--ignore-pattern', 'dist', '--ignore-pattern', '.next'], {
  cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024,
});
// ESLint exits 1 when it found problems and 2 on a configuration or crash error; only 2 is a tool failure.
if (run.status === 2 || run.error) {
  console.error(run.stderr || run.error?.message || 'eslint failed');
  process.exit(2);
}

let results;
try { results = JSON.parse(run.stdout); } catch { console.error('eslint produced no JSON output:\n' + run.stderr); process.exit(2); }
const errors = results.reduce((n, f) => n + f.errorCount + f.fatalErrorCount, 0);
const warnings = results.reduce((n, f) => n + f.warningCount, 0);
const byRule = new Map();
for (const f of results) for (const m of f.messages) if (m.severity === 2) byRule.set(m.ruleId ?? 'fatal', (byRule.get(m.ruleId ?? 'fatal') ?? 0) + 1);
const top = [...byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([r, n]) => `${r} ${n}`).join(', ');

if (update) {
  writeFileSync(baselinePath, JSON.stringify({ errors, warnings, updatedAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
  console.log(`baseline written: ${errors} errors, ${warnings} warnings${top ? ` (${top})` : ''}`);
  process.exit(0);
}

if (!existsSync(baselinePath)) {
  console.error(`no .lint-baseline.json; run "node scripts/lint-baseline.mjs --update" once and commit it. Current: ${errors} errors, ${warnings} warnings.`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
console.log(`eslint: ${errors} errors (baseline ${baseline.errors}), ${warnings} warnings (baseline ${baseline.warnings})${top ? `; top rules: ${top}` : ''}`);
if (errors > baseline.errors) {
  console.error(`lint errors rose from ${baseline.errors} to ${errors}; fix them or, for a deliberate exception, update the baseline in the same PR with a reason.`);
  process.exit(1);
}
if (errors < baseline.errors) console.log(`errors fell below the baseline; lower it with --update when convenient.`);
