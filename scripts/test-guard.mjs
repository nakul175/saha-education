// Slice 11a: regression guard and result handling for scripts/test.mjs. Pure functions, no I/O except the two small
// JSON files, so tests/test-runner-contract.mjs can exercise every branch.
//
//   tests/regression-baseline.json  minimum passed-assertion count per suite, taken from a real run
//   tests/quarantine.json           suites excused from the guard, each with a reason and a date
//
// The guard fails when a suite reports fewer passed assertions than its baseline, when a baselined suite no longer
// exists, or when a baselined suite that was due to run did not report. A quarantined suite is excused from the guard
// only: a suite that fails still fails the run. The baseline changes only through `node scripts/test.mjs --update-baseline`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { GUARDED_LAYERS } from './test-catalogue.mjs';

export const BASELINE_FILE = 'tests/regression-baseline.json';
export const QUARANTINE_FILE = 'tests/quarantine.json';
export const QUARANTINE_REVIEW_DAYS = 30;

export function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Pull passed/failed/skipped out of one parsed result report (the existing { passed } files, report.mjs, Playwright's JSON). */
export function countsFromReport(json) {
  if (!json || typeof json !== 'object') return null;
  if (json.stats && typeof json.stats === 'object' && num(json.stats.expected) !== null) {
    const s = json.stats; // Playwright JSON reporter
    // Slice 11g (test review M3): a test that passed only on retry failed once; it is counted as failed and named as flaky, not hidden in passed.
    return { passed: s.expected, failed: (s.unexpected ?? 0) + (s.flaky ?? 0), skipped: s.skipped ?? 0, flaky: s.flaky ?? 0 };
  }
  if (num(json.passed) === null) return null;
  return { passed: json.passed, failed: num(json.failed), skipped: num(json.skipped) };
}

/** The last line of a suite's output that is a JSON object with a numeric `passed`. */
export function countsFromOutput(text) {
  const lines = String(text ?? '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l.startsWith('{') || !l.endsWith('}')) continue;
    try { const c = countsFromReport(JSON.parse(l)); if (c) return c; } catch { /* not JSON */ }
  }
  return null;
}

/**
 * Decide a suite's status from its exit code and counts.
 * passed: exit 0 and at least one assertion passed (or an uncounted suite that exits 0)
 * failed: non-zero exit, a reported failure, or a counted run in which nothing passed and nothing was skipped (vacuous)
 * skipped: exit 0 and every reported check was skipped
 */
export function decideStatus(exitCode, counts, { timedOut = false } = {}) {
  if (timedOut) return { status: 'failed', reason: 'timed out' };
  if (exitCode !== 0) return { status: 'failed', reason: `exit code ${exitCode}` };
  if (!counts) return { status: 'passed', reason: null };
  if (counts.failed) return { status: 'failed', reason: `${counts.failed} failed check(s) reported with exit code 0` };
  if (counts.passed === 0 && counts.skipped) return { status: 'skipped', reason: 'every check was skipped' };
  if (counts.passed === 0) return { status: 'failed', reason: 'no assertion passed (a suite that checks nothing is not a pass)' };
  return { status: 'passed', reason: null };
}

/**
 * evaluateGuard({ baseline, quarantine, results, catalogueIds, planned, today })
 *   results: Map or object id -> { status, passed }   (suites that ran in this invocation)
 *   catalogueIds: Set of every suite id in the catalogue now
 *   planned: Set of suite ids this invocation was due to run
 * Returns { ok, findings, warnings, evaluated, newSuites }. A finding has { id, kind, message, excused }.
 */
export function evaluateGuard({ baseline, quarantine, results, catalogueIds, planned, today = new Date().toISOString().slice(0, 10) }) {
  const findings = [], warnings = [], r = results instanceof Map ? results : new Map(Object.entries(results));
  const q = quarantine?.suites ?? {}, base = baseline?.suites ?? {};
  for (const [id, entry] of Object.entries(q)) {
    if (!entry?.reason || !/^\d{4}-\d{2}-\d{2}$/.test(entry?.date ?? '')) findings.push({ id, kind: 'bad-quarantine', message: `tests/quarantine.json entry ${id} needs a reason and an ISO date (YYYY-MM-DD).`, excused: false });
    else {
      const age = Math.floor((Date.parse(today) - Date.parse(entry.date)) / 86400000);
      if (age > QUARANTINE_REVIEW_DAYS) warnings.push(`Quarantine of ${id} is ${age} days old (since ${entry.date}): ${entry.reason} Review it.`);
      if (!(id in base)) warnings.push(`Quarantine entry ${id} is not in the regression baseline.`);
    }
  }
  let evaluated = 0;
  for (const [id, b] of Object.entries(base)) {
    const excused = id in q && !!q[id]?.reason;
    const add = (kind, message) => findings.push({ id, kind, message: message + (excused ? ` (excused by quarantine since ${q[id].date}: ${q[id].reason})` : ''), excused });
    if (!catalogueIds.has(id)) { add('disappeared', `Suite ${id} (${b.file}) is in the baseline but no longer exists. If it was removed on purpose, run node scripts/test.mjs --update-baseline --reason "<why>".`); continue; }
    if (!planned.has(id)) continue; // the layer or tier was not part of this run
    evaluated++;
    const got = r.get(id);
    if (!got || !['passed', 'failed', 'skipped'].includes(got.status)) { add('missing', `Suite ${id} was due to run but reported nothing${got ? ` (${got.status})` : ''}.`); continue; }
    if (b.minPassed === null || b.minPassed === undefined) { if (got.status === 'failed') add('failed', `Suite ${id} failed.`); continue; }
    if (got.passed === null || got.passed === undefined) add('uncounted', `Suite ${id} reported no assertion count; baseline needs at least ${b.minPassed}.`);
    else if (got.passed < b.minPassed) add('dropped', `Suite ${id} passed ${got.passed} assertion(s); baseline is ${b.minPassed} (down ${b.minPassed - got.passed}).`);
  }
  const newSuites = [...r.keys()].filter(id => !(id in base) && GUARDED_LAYERS.includes(id.split('/')[0]));
  return { ok: findings.every(f => f.excused), findings, warnings, evaluated, newSuites };
}

/**
 * Compute the next baseline from one run's results. results: array of { id, layer, file, status, passed }.
 * Returns { baseline, changes: { added, raised, lowered, removed, unchanged }, needsReason, refused }.
 * Refuses while any guarded suite in the run failed. Suites outside this run keep their entry unless they left the catalogue.
 */
export function nextBaseline({ baseline, results, catalogueIds, reason, today = new Date().toISOString().slice(0, 10), node = process.version }) {
  const old = baseline?.suites ?? {}, suites = { ...old };
  const changes = { added: [], raised: [], lowered: [], removed: [], unchanged: 0, uncounted: [] };
  const failed = results.filter(x => GUARDED_LAYERS.includes(x.layer) && ['failed', 'blocked'].includes(x.status));
  if (failed.length) return { refused: `Refusing to update the baseline: ${failed.map(f => f.id).join(', ')} did not pass. A baseline must come from a green run.`, baseline, changes, needsReason: false };
  for (const x of results) {
    if (!GUARDED_LAYERS.includes(x.layer) || x.status === 'not-present') continue;
    if (x.status === 'skipped') continue; // all-skipped suites are never baselined
    const min = x.passed ?? null, prev = old[x.id];
    if (min === null) changes.uncounted.push(x.id);
    suites[x.id] = { layer: x.layer, file: x.file, minPassed: min, ...(min === null ? { note: 'no assertion count reported; the guard only checks that the suite exists and exits 0' } : {}) };
    if (!prev) changes.added.push(x.id);
    else if (prev.minPassed !== null && min !== null && min > prev.minPassed) changes.raised.push([x.id, prev.minPassed, min]);
    else if (prev.minPassed !== null && (min === null || min < prev.minPassed)) changes.lowered.push([x.id, prev.minPassed, min]);
    else changes.unchanged++;
  }
  for (const id of Object.keys(old)) if (!catalogueIds.has(id)) { delete suites[id]; changes.removed.push(id); }
  const needsReason = changes.lowered.length > 0 || changes.removed.length > 0;
  const log = [...(baseline?.log ?? [])];
  if (needsReason && reason) log.push({ date: today, reason, lowered: Object.fromEntries(changes.lowered.map(([id, a, b]) => [id, [a, b]])), removed: changes.removed });
  const sorted = Object.fromEntries(Object.entries(suites).sort(([a], [b]) => a.localeCompare(b)));
  return {
    refused: needsReason && !reason ? `The update lowers or removes: ${[...changes.lowered.map(l => l[0]), ...changes.removed].join(', ')}. Lowering a baseline is deliberate; pass --reason "<why>" and it is recorded in the file.` : null,
    baseline: { description: 'Minimum passed-assertion count per suite, from a real run. Changed only by node scripts/test.mjs --update-baseline.', updatedAt: today, node, suites: sorted, log: log.slice(-20) },
    changes, needsReason,
  };
}

export function writeBaseline(baseline, file = BASELINE_FILE) {
  writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n');
}
