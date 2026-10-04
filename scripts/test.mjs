#!/usr/bin/env node
// Slice 11a: one entry point for every Saha test layer.
//
//   node scripts/test.mjs <layer|alias ...> [--fast] [--guard] [--only <id>] [--skip <layer>] [--report <file>]
//   node scripts/test.mjs --check-catalogue        fail when a test file is unclassified or a *-smoke.mjs module is not imported
//   node scripts/test.mjs --list [--json]          print the suite catalogue
//   node scripts/test.mjs [layers] --update-baseline [--reason "<why>"]   deliberately change tests/regression-baseline.json
//   node scripts/test.mjs --clean                  restore tracked and delete untracked tests/*-result.json files
//
// Layers: static unit integration resilience smoke ui nfr uat manual. Aliases: pr (static unit integration resilience smoke),
// full (every layer except manual), regression (full plus the regression guard). With no argument it runs pr.
// Each suite runs as a child process; its result JSON is read, copied to tests/reports/results/, and the repository is
// restored (HANDOVER.md: stray tests/*-result.json files break the documentation check). The summary is written to
// tests/reports/summary.json. Exit code: 0 all passed, 1 a suite or the guard failed, 2 usage or catalogue error.
import { spawn, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LAYERS, FILE_LAYERS, SUITE_ARGS, buildCatalogue, summariseCatalogue } from './test-catalogue.mjs';
import { BASELINE_FILE, QUARANTINE_FILE, countsFromOutput, countsFromReport, decideStatus, evaluateGuard, nextBaseline, readJson, writeBaseline } from './test-guard.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
process.chdir(ROOT);
// node:sqlite (used to check the restore drill's input) prints an ExperimentalWarning on Node 22; keep the table readable.
process.removeAllListeners('warning');
process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.error(`(node) ${w.name}: ${w.message}`); });
const REPORTS = 'tests/reports';
const ALIASES = {
  pr: { layers: ['static', 'unit', 'integration', 'resilience', 'smoke'], prOnly: true },
  full: { layers: ['static', 'unit', 'integration', 'resilience', 'smoke', 'ui', 'nfr', 'uat'] },
  regression: { layers: ['static', 'unit', 'integration', 'resilience', 'smoke', 'ui', 'nfr', 'uat'], guard: true },
};
const TIMEOUT_MIN = { unit: 10, integration: 40, resilience: 15, smoke: 20, ui: 30, nfr: 30, uat: 15, manual: 60, static: 15 };

// ---------- arguments ----------
function parseArgs(argv) {
  const a = { layers: [], only: [], skip: [], flags: new Set(), report: null, reason: null, timeout: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--report') a.report = argv[++i];
    else if (x === '--reason') a.reason = argv[++i];
    else if (x === '--only') a.only.push(...String(argv[++i] ?? '').split(',').filter(Boolean));
    else if (x === '--skip') a.skip.push(...String(argv[++i] ?? '').split(',').filter(Boolean));
    else if (x === '--timeout') a.timeout = Number(argv[++i]);
    else if (x.startsWith('--')) a.flags.add(x.slice(2));
    else a.layers.push(x);
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const usage = msg => { console.error(`${msg}\nUsage: node scripts/test.mjs <${[...LAYERS, ...Object.keys(ALIASES)].join('|')} ...> [--fast] [--guard] [--only <id>] [--skip <layer>] [--report <file>]\n       node scripts/test.mjs --check-catalogue | --list [--json] | --update-baseline [--reason "<why>"] | --clean`); process.exit(2); };
const known = new Set(['fast', 'guard', 'check-catalogue', 'list', 'json', 'update-baseline', 'clean', 'help']);
for (const f of args.flags) if (!known.has(f)) usage(`Unknown option --${f}.`);
if (args.flags.has('help')) usage('node scripts/test.mjs runs the Saha test layers.');
for (const l of args.layers) if (!LAYERS.includes(l) && !ALIASES[l]) usage(`Unknown layer or alias "${l}".`);
for (const l of args.skip) if (!LAYERS.includes(l)) usage(`--skip ${l}: not a layer.`);
if (args.timeout !== null && !(args.timeout > 0)) usage('--timeout needs a positive number of minutes.');

// ---------- helpers ----------
const fmtMs = ms => ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.floor(ms / 60000)}m ${String(Math.round(ms % 60000 / 1000)).padStart(2, '0')}s`;
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { return null; } };
const lines = s => (s ?? '').split('\n').filter(Boolean);
const slug = id => id.replaceAll('/', '__');
const writeJson = (file, value) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };

/** Tracked files under tests/ that a suite rewrote (tests/*-result.json, tests/evidence/*, tests/ehr-synthetic-document.json) are restored from HEAD; untracked tests/*-result.json are deleted. */
function snapshotDirty() { return new Set(lines(git('diff', '--name-only', '--', 'tests'))); }
const cleaned = { restored: [], deleted: [], otherChanged: [] };
// Generated artifacts that suites rewrite in tracked files: result reports, slice evidence, and the synthetic EHR document the EHR contract regenerates.
const ARTIFACT = /^tests\/([^/]+-result\.json|evidence\/.+|ehr-synthetic-document\.json)$/;
function cleanup(dirtyBefore = new Set()) {
  if (git('rev-parse', '--git-dir') === null) return cleaned;
  const changed = lines(git('diff', '--name-only', '--', 'tests')).filter(f => !dirtyBefore.has(f));
  const toRestore = changed.filter(f => ARTIFACT.test(f));
  if (toRestore.length && git('checkout', '--', ...toRestore) !== null) cleaned.restored.push(...toRestore);
  cleaned.otherChanged.push(...changed.filter(f => !ARTIFACT.test(f))); // not restored: it may be your own edit
  for (const f of lines(git('ls-files', '--others', '--exclude-standard', '--', 'tests')).filter(f => /^tests\/[^/]+-result\.json$/.test(f))) { rmSync(f, { force: true }); cleaned.deleted.push(f); }
  return cleaned;
}

function killTree(child, signal) {
  try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* already gone */ } }
}

function runCommand({ cmd, args: a = [], env = {}, timeoutMs, logId }) {
  return new Promise(done => {
    const started = Date.now();
    let out = '', timedOut = false;
    // detached: the suite leads its own process group, so a timeout or Ctrl-C also stops the Workers it started (never anyone else's processes).
    const child = spawn(cmd, a, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const take = c => { out += c.toString(); if (out.length > 3_000_000) out = out.slice(-2_000_000); };
    child.stdout.on('data', take); child.stderr.on('data', take);
    const timer = setTimeout(() => { timedOut = true; killTree(child, 'SIGTERM'); setTimeout(() => killTree(child, 'SIGKILL'), 10000).unref(); }, timeoutMs);
    activeChild = child;
    child.on('error', e => { out += `\n${e.message}`; });
    child.on('close', (code, signal) => {
      clearTimeout(timer); activeChild = null;
      const exitCode = code ?? (signal ? 128 : 1), durationMs = Date.now() - started;
      if (logId) { mkdirSync(`${REPORTS}/logs`, { recursive: true }); writeFileSync(`${REPORTS}/logs/${slug(logId)}.log`, out.length > 1_500_000 ? '[truncated; showing the tail]\n' + out.slice(-1_500_000) : out); }
      done({ exitCode, output: out, durationMs, timedOut });
    });
  });
}
let activeChild = null;

// ---------- catalogue modes ----------
const catalogue = buildCatalogue(ROOT);
function writeCatalogueReport() {
  writeJson(`${REPORTS}/catalogue.json`, {
    generatedAt: new Date().toISOString(), summary: summariseCatalogue(catalogue), errors: catalogue.errors,
    suites: catalogue.suites.map(({ id, file, layer, tier, runner, needs, requirements, results, note, reason }) => ({ id, file, layer, tier, runner, needs, requirementsCited: requirements, resultFiles: results ?? [], note: note ?? reason })),
    components: catalogue.components.map(({ file, via, requirements }) => ({ file, via, requirementsCited: requirements })),
    support: catalogue.support.map(s => s.file),
  });
}
function printCatalogue() {
  const s = summariseCatalogue(catalogue);
  console.log('layer        suites  components  suites citing no requirement  requirement ids cited');
  for (const l of FILE_LAYERS) { const v = s.layers[l]; console.log(`${l.padEnd(12)} ${String(v.suites).padStart(6)}  ${String(v.components).padStart(10)}  ${String(v.suitesCitingNoRequirement).padStart(28)}  ${String(v.requirementsCited).padStart(21)}`); }
  console.log(`\n${s.suites} suites, ${s.components} component modules (run through their entry), ${s.supportFiles} support files.`);
  console.log(`${s.suites - s.suitesCitingNoRequirement} of ${s.suites} suites are cited by at least one requirement in requirements/evidence-map.json (${s.suitesCitingNoRequirement} cite none); ${s.components - s.componentsCitingNoRequirement} of ${s.components} component modules are cited (${s.componentsCitingNoRequirement} cite none); ${s.requirementsCitedBySomeTest} of 176 requirements cite at least one test file. A citation is evidence context, not acceptance.`);
}
if (args.flags.has('check-catalogue') || args.flags.has('list')) {
  writeCatalogueReport();
  if (args.flags.has('list')) {
    if (args.flags.has('json')) console.log(JSON.stringify(JSON.parse(readFileSync(`${REPORTS}/catalogue.json`, 'utf8')), null, 2));
    else { printCatalogue(); for (const e of catalogue.suites) console.log(`${e.id.padEnd(48)} ${e.tier.padEnd(8)} ${e.file}`); }
  }
  if (catalogue.errors.length) { console.error(`\nCatalogue check FAILED (${catalogue.errors.length}):\n` + catalogue.errors.map(e => `  - ${e}`).join('\n')); process.exit(1); }
  if (args.flags.has('check-catalogue')) { printCatalogue(); console.log('\nCatalogue check passed: every test file is classified and every *-smoke.mjs module is imported by tests/api-smoke.mjs.'); }
  process.exit(0);
}
if (args.flags.has('clean')) { const c = cleanup(); console.log(`Restored ${c.restored.length} tracked file(s), deleted ${c.deleted.length} untracked result file(s).`); process.exit(0); }
if (catalogue.errors.length) { console.error('The test catalogue is inconsistent; nothing was run:\n' + catalogue.errors.map(e => `  - ${e}`).join('\n')); process.exit(2); }

// ---------- plan ----------
const only = new Set(args.only);
for (const o of only) if (!catalogue.suites.some(s => s.id === o || s.file === o)) usage(`--only ${o}: no such suite. Run node scripts/test.mjs --list.`);
const updateOnly = args.flags.has('update-baseline') && !args.layers.length && !only.size;
let requested = args.layers;
if (!requested.length) requested = only.size ? [...FILE_LAYERS] : updateOnly ? [] : ['pr'];
const layers = [...new Set(requested.flatMap(r => ALIASES[r]?.layers ?? [r]))].filter(l => !args.skip.includes(l)).sort((a, b) => LAYERS.indexOf(a) - LAYERS.indexOf(b));
// Only the pr alias restricts a layer to its pr-tier suites; naming a layer (or full) runs all of that layer's suites except manual ones.
const explicit = new Set(requested.flatMap(r => LAYERS.includes(r) ? [r] : r === 'pr' ? [] : ALIASES[r].layers));
const wantGuard = args.flags.has('guard') || requested.some(r => ALIASES[r]?.guard);
const wanted = s => !only.size || only.has(s.id) || only.has(s.file);
const plan = layers.filter(l => l !== 'static' || !only.size).map(layer => ({ layer, suites: layer === 'static' ? [] : catalogue.suites.filter(s => s.layer === layer && wanted(s) && (layer === 'manual' ? explicit.has('manual') : s.tier !== 'manual') && (explicit.has(layer) || s.tier === 'pr')) })).filter(p => !only.size || p.suites.length);

// ---------- state ----------
const env = { ...process.env };
if (env.SAHA_TEST_PORT && !env.SAHA_RESTORE_PORT) env.SAHA_RESTORE_PORT = String(Number(env.SAHA_TEST_PORT) + 1);
const records = [];
const dirtyBefore = snapshotDirty();
let built = null, interrupted = false;
const startedAt = new Date();
mkdirSync(`${REPORTS}/results`, { recursive: true });

async function ensureBuild() {
  if (built !== null) return built;
  if (args.flags.has('fast') && existsSync('dist/server/wrangler.json')) { built = { ok: true, skipped: true }; console.log('build: skipped (--fast, dist/ exists)'); return built; }
  console.log('build: npm run build ...');
  const r = await runCommand({ cmd: 'npm', args: ['run', 'build'], timeoutMs: 15 * 60000, logId: 'build' });
  built = { ok: r.exitCode === 0, durationMs: r.durationMs };
  records.push({ id: 'build', layer: 'build', kind: 'step', file: 'npm run build', status: built.ok ? 'passed' : 'failed', passed: null, failed: null, skipped: null, durationMs: r.durationMs, exitCode: r.exitCode, log: `${REPORTS}/logs/build.log` });
  console.log(`build: ${built.ok ? 'ok' : 'FAILED'} (${fmtMs(r.durationMs)})`);
  if (!built.ok) console.log(r.output.split('\n').slice(-25).map(l => '    ' + l).join('\n'));
  return built;
}

async function prepareIntegrationState() {
  const { freshDatabase } = await import(pathToFileURL(join(ROOT, 'tests/lib/worker.mjs')).href);
  freshDatabase('.wrangler/test-state'); // the same migrations, in the same order, as the CI step "Disposable local database"
}
async function populatedState() {
  const dir = '.wrangler/test-state/v3/d1';
  if (!existsSync(dir)) return false;
  const found = [];
  const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.sqlite') && e.name !== 'metadata.sqlite') found.push(p); } };
  walk(dir);
  if (found.length !== 1) return false;
  try { const { DatabaseSync } = await import('node:sqlite'); const db = new DatabaseSync(found[0], { readOnly: true }); const n = db.prepare('SELECT count(*) AS n FROM command_receipts').get().n; db.close(); return n > 0; } catch { return false; }
}

// Slice 11h: which report files a suite wrote is decided against a snapshot of every candidate file (size, modification time,
// inode) taken just before the suite starts: a file is the suite's only if it is new or changed since then. The earlier rule
// (modified at or after the start, less 5 ms) also counted the previous suite's report when the next suite started within a
// few milliseconds of it, which happened on GitHub's runners and failed four runner checks.
function reportCandidates(extra = []) {
  const out = new Set(extra);
  if (existsSync(REPORTS)) for (const e of readdirSync(REPORTS, { withFileTypes: true })) if (e.isFile() && e.name.endsWith('.json') && !['summary.json', 'catalogue.json'].includes(e.name)) out.add(`${REPORTS}/${e.name}`);
  for (const e of readdirSync('tests', { withFileTypes: true })) if (e.isFile() && /-result\.json$/.test(e.name)) out.add(`tests/${e.name}`);
  return [...out];
}
const reportSignature = f => { try { const s = statSync(f); return s.isFile() ? `${s.mtimeMs}:${s.size}:${s.ino}` : null; } catch { return null; } };
const snapshotReports = (extra = []) => new Map(reportCandidates(extra).map(f => [f, reportSignature(f)]));
const writtenSince = (f, before) => { const now = reportSignature(f); return now !== null && now !== (before.get(f) ?? null); };
function changedReportFiles(before) { return reportCandidates().filter(f => writtenSince(f, before)); }

function collect(suite, before, output) {
  const fresh = f => writtenSince(f, before);
  // A suite writes one result file. Its own conventional name wins; otherwise the first fresh file named in its source.
  const conventional = `tests/${suite.file.split('/').pop().replace(/\.[^.]+$/, '')}-result.json`;
  let files = [...(suite.results ?? [])].sort((a, b) => (b === conventional) - (a === conventional)).filter(fresh).slice(0, 1);
  if (!files.length) {
    // New-style suites choose their own file name under tests/reports/. Prefer files named after the suite; otherwise take what changed during the run.
    const stem = suite.file.split('/').pop().replace(/\.[^.]+$/, ''), changed = changedReportFiles(before), named = changed.filter(f => f.split('/').pop().includes(stem));
    files = named.length ? named : changed;
  }
  let total = null;
  const used = [];
  for (const f of files) {
    let counts = null;
    try { counts = countsFromReport(JSON.parse(readFileSync(f, 'utf8'))); } catch { /* unreadable report: ignored, the exit code still decides */ }
    if (!counts) continue;
    used.push(f);
    total = total ? { passed: total.passed + counts.passed, failed: (total.failed ?? 0) + (counts.failed ?? 0), skipped: (total.skipped ?? 0) + (counts.skipped ?? 0) } : { ...counts };
    copyFileSync(f, `${REPORTS}/results/${slug(suite.id)}${used.length > 1 ? `-${used.length}` : ''}.json`);
  }
  if (total) return { counts: total, source: 'result-file', files: used };
  const fromOut = countsFromOutput(output);
  return fromOut ? { counts: fromOut, source: 'stdout', files: [] } : { counts: null, source: 'none', files: [] };
}

/** Playwright is not a project dependency; find it in SAHA_PLAYWRIGHT_MODULES, tests/ui/node_modules or node_modules. */
function findPlaywright() {
  for (const base of [env.SAHA_PLAYWRIGHT_MODULES, 'tests/ui', '.'].filter(Boolean)) { const bin = resolve(base, 'node_modules/.bin/playwright'); if (existsSync(bin)) return bin; }
  return null;
}

async function blockedReason(suite) {
  // Manual suites that need credentials on stdin or packages outside the project are never started by the runner (pull request #126).
  if (suite.layer === 'manual' && suite.directOnly) return `run it directly, not through the runner: ${suite.note}`;
  if (suite.needs?.includes('build') && !(await ensureBuild()).ok) return 'the build failed';
  if (suite.layer === 'manual') { const miss = (suite.needsEnv ?? []).filter(k => !env[k]); if (miss.length) return `set ${miss.join(', ')} (${suite.note})`; }
  if (suite.runner === 'playwright' && !findPlaywright()) return 'Playwright is not installed (install it in tests/ui or set SAHA_PLAYWRIGHT_MODULES to a directory with node_modules, then playwright install chromium)';
  if (suite.layer === 'resilience' && suite.file === 'tests/recovery-drill.mjs' && !(await populatedState())) return 'it restores the database the HTTP suite populated; run the integration layer first (node scripts/test.mjs integration resilience)';
  return null;
}

async function runSuite(suite) {
  const rec = { id: suite.id, layer: suite.layer, kind: 'suite', file: suite.file, tier: suite.tier, status: null, passed: null, failed: null, skipped: null, durationMs: 0, exitCode: null, countSource: 'none', resultFiles: [], requirementsCited: suite.requirements.length };
  const why = await blockedReason(suite);
  if (why) { Object.assign(rec, { status: 'blocked', reason: why, failed: null }); records.push(rec); console.log(`  BLOCKED  ${suite.id}: ${why}`); return rec; }
  const isApi = suite.file === 'tests/run-api-smoke.mjs';
  if (suite.layer !== 'unit') console.log(`  running  ${suite.id} ...`);
  if (isApi) {
    try { await prepareIntegrationState(); } catch (e) { Object.assign(rec, { status: 'blocked', reason: `could not build the local D1 state: ${String(e.message).split('\n')[0]}` }); records.push(rec); console.log(`  BLOCKED  ${suite.id}: ${rec.reason}`); return rec; }
  }
  const pw = suite.runner === 'playwright';
  const pwOut = resolve(`${REPORTS}/ui-playwright-result.json`);
  const resultFiles = pw ? [`${REPORTS}/ui-playwright-result.json`] : (suite.results ?? []);
  const before = snapshotReports(resultFiles);
  const r = await runCommand({
    cmd: pw ? findPlaywright() : process.execPath, args: pw ? ['test', '--config', suite.file, '--reporter=list,json,./tests/ui/support/reporter.mjs'] : [suite.file, ...(SUITE_ARGS[suite.file] ?? [])],
    env: { ...env, ...(pw ? { PLAYWRIGHT_JSON_OUTPUT_NAME: pwOut } : {}) }, timeoutMs: (args.timeout ?? TIMEOUT_MIN[suite.layer] ?? 20) * 60000, logId: suite.id,
  });
  const got = collect({ ...suite, results: resultFiles }, before, r.output);
  const decided = decideStatus(r.exitCode, got.counts, { timedOut: r.timedOut });
  Object.assign(rec, { status: decided.status, reason: decided.reason, durationMs: r.durationMs, exitCode: r.exitCode, countSource: got.source, resultFiles: got.files, log: `${REPORTS}/logs/${slug(suite.id)}.log` });
  if (got.counts) Object.assign(rec, { passed: got.counts.passed, failed: got.counts.failed ?? (decided.status === 'failed' ? null : 0), skipped: got.counts.skipped ?? 0 });
  records.push(rec);
  const count = rec.passed === null ? 'no count' : `${rec.passed} passed${rec.failed ? `, ${rec.failed} failed` : ''}${rec.skipped ? `, ${rec.skipped} skipped` : ''}`;
  console.log(`  ${rec.status === 'passed' ? 'ok     ' : rec.status.toUpperCase().padEnd(7)}  ${suite.id}  ${count}  ${fmtMs(rec.durationMs)}${rec.reason ? `  [${rec.reason}]` : ''}`);
  if (rec.status === 'failed') {
    // Slice 11h: the HTTP suite interleaves the Worker's request log with its own output, so the last lines are usually request
    // log lines. Show the suite's own error lines first (the first CI failure after round 11 showed only Worker log lines).
    const lines = r.output.split('\n').filter(Boolean);
    const errors = lines.filter(l => !/^\[wrangler:|^\{"event":"saha_/.test(l) && /Error|assert|FAIL|expected|actual|Expected|Received|exceeded|refused|Cannot|undefined/.test(l)).slice(0, 40);
    if (errors.length) console.log(['      | error lines:', ...errors.map(l => '      |   ' + l.slice(0, 300))].join('\n'));
    console.log(lines.filter(l => !/^\[wrangler:|^\{"event":"saha_/.test(l)).slice(-25).map(l => '      | ' + l.slice(0, 220)).join('\n'));
  }
  return rec;
}

const STATIC_STEPS = [
  { id: 'static/catalogue', file: 'node scripts/test.mjs --check-catalogue', inProcess: true },
  { id: 'static/typecheck', file: 'tsc --noEmit', cmd: process.execPath, args: ['node_modules/typescript/bin/tsc', '--noEmit'] },
  { id: 'static/documentation', file: 'python3 scripts/check-documentation.py', cmd: 'python3', args: ['scripts/check-documentation.py'] },
  { id: 'static/requirements', file: 'node scripts/audit-requirements.mjs --check', cmd: process.execPath, args: ['scripts/audit-requirements.mjs', '--check'] },
];
async function runStatic() {
  for (const step of STATIC_STEPS) {
    const rec = { id: step.id, layer: 'static', kind: 'step', file: step.file, status: null, passed: null, failed: null, skipped: null, durationMs: 0, exitCode: null };
    if (step.inProcess) { rec.status = 'passed'; rec.exitCode = 0; rec.note = `${catalogue.suites.length} suites, ${catalogue.components.length} components classified`; }
    else {
      const r = await runCommand({ cmd: step.cmd, args: step.args, env, timeoutMs: TIMEOUT_MIN.static * 60000, logId: step.id });
      Object.assign(rec, { status: r.exitCode === 0 ? 'passed' : 'failed', exitCode: r.exitCode, durationMs: r.durationMs, log: `${REPORTS}/logs/${slug(step.id)}.log` });
      if (r.exitCode !== 0) console.log(r.output.split('\n').filter(Boolean).slice(-15).map(l => '      | ' + l.slice(0, 220)).join('\n'));
    }
    records.push(rec);
    console.log(`  ${rec.status === 'passed' ? 'ok     ' : 'FAILED '}  ${step.id}  ${fmtMs(rec.durationMs)}`);
  }
}

// ---------- run ----------
function summarise(extra = {}) {
  const suiteRecs = records.filter(r => r.kind === 'suite');
  const layerRows = [...(records.some(r => r.layer === 'build') ? [{ layer: 'build', suites: [] }] : []), ...plan].map(p => {
    const rs = records.filter(r => r.layer === p.layer && (['static', 'build'].includes(p.layer) || r.kind === 'suite'));
    const present = ['static', 'build'].includes(p.layer) ? true : p.suites.length > 0;
    const sum = k => rs.reduce((n, r) => n + (r[k] ?? 0), 0);
    const bad = rs.filter(r => ['failed', 'blocked'].includes(r.status)).length;
    return { layer: p.layer, status: !present ? 'not present' : bad ? 'failed' : rs.length && rs.every(r => r.status === 'skipped') ? 'skipped' : 'passed', suites: rs.length, passed: sum('passed'), failed: sum('failed'), skipped: sum('skipped'), durationMs: rs.reduce((n, r) => n + r.durationMs, 0), failedSuites: bad };
  });
  const failedRecs = records.filter(r => ['failed', 'blocked'].includes(r.status));
  return {
    generatedAt: new Date().toISOString(), startedAt: startedAt.toISOString(), command: `node scripts/test.mjs ${process.argv.slice(2).join(' ')}`.trim(), node: process.version,
    layers: layerRows,
    totals: { suites: suiteRecs.length, passed: suiteRecs.reduce((n, r) => n + (r.passed ?? 0), 0), failed: suiteRecs.reduce((n, r) => n + (r.failed ?? 0), 0), skipped: suiteRecs.reduce((n, r) => n + (r.skipped ?? 0), 0), failedSuites: failedRecs.length, durationMs: Date.now() - startedAt.getTime() },
    suites: records, ...extra,
  };
}
function printTable(summary) {
  const head = ['layer', 'status', 'suites', 'passed', 'failed', 'skipped', 'time'], rows = summary.layers.map(l => { const none = l.status === 'not present', plain = none || ['static', 'build'].includes(l.layer); return [l.layer, l.status, none ? '-' : l.suites, plain ? '-' : l.passed, plain ? '-' : l.failed, plain ? '-' : l.skipped, none ? '-' : fmtMs(l.durationMs)]; });
  rows.push(['total', summary.totals.failedSuites ? 'FAILED' : 'passed', summary.totals.suites, summary.totals.passed, summary.totals.failed, summary.totals.skipped, fmtMs(summary.totals.durationMs)]);
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const fmt = r => '  ' + r.map((c, i) => i < 2 ? String(c).padEnd(w[i]) : String(c).padStart(w[i])).join('  ');
  console.log('\n' + fmt(head) + '\n  ' + w.map(x => '-'.repeat(x)).join('  ') + '\n' + rows.map(fmt).join('\n'));
}

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { interrupted = true; if (activeChild) killTree(activeChild, 'SIGTERM'); cleanup(dirtyBefore); const s = summarise({ interrupted: true, cleanup: { restoredTrackedFiles: cleaned.restored, deletedUntrackedResultFiles: cleaned.deleted } }); writeJson(`${REPORTS}/summary.json`, s); console.error(`\nInterrupted by ${sig}; the repository was restored and a partial summary written.`); process.exit(130); });

function applyBaselineUpdate(source) {
  const catalogueIds = new Set(catalogue.suites.map(s => s.id));
  const next = nextBaseline({ baseline: readJson(BASELINE_FILE, null), results: source, catalogueIds, reason: args.reason });
  if (next.refused) { console.error(`\n${next.refused}`); return false; }
  writeBaseline(next.baseline);
  const c = next.changes;
  console.log(`\nBaseline ${BASELINE_FILE} updated: ${c.added.length} added, ${c.raised.length} raised, ${c.lowered.length} lowered, ${c.removed.length} removed, ${c.unchanged} unchanged.`);
  for (const [id, a, b] of c.raised) console.log(`  raised   ${id}: ${a} -> ${b}`);
  for (const [id, a, b] of c.lowered) console.log(`  LOWERED  ${id}: ${a} -> ${b}`);
  for (const id of c.removed) console.log(`  REMOVED  ${id}`);
  if (c.uncounted.length) console.log(`  note     no assertion count from: ${c.uncounted.join(', ')} (only existence is guarded)`);
  console.log('  Review the diff and commit it with the change that justifies it.');
  return true;
}
if (updateOnly) {
  const last = readJson(`${REPORTS}/summary.json`, null);
  if (!last) { console.error('--update-baseline without layers needs tests/reports/summary.json from an earlier run (for example: node scripts/test.mjs full).'); process.exit(2); }
  console.log(`Updating the baseline from the last summary (${last.command}, ${last.generatedAt}).`);
  process.exit(applyBaselineUpdate(last.suites.filter(r => r.kind === 'suite')) ? 0 : 1);
}

let summary;
try {
  writeCatalogueReport();
  console.log(`Running ${plan.map(p => p.layer).join(' ')}${args.flags.has('fast') ? ' --fast' : ''}; ${plan.reduce((n, p) => n + p.suites.length, 0)} suite(s)${layers.includes('static') && !only.size ? ` and ${STATIC_STEPS.length} static step(s)` : ''}.`);
  for (const p of plan) {
    if (p.layer === 'static') { console.log('\n[static]'); await runStatic(); }
    else if (!p.suites.length) { console.log(`\n[${p.layer}] not present: ${existsSync(`tests/${p.layer}`) || ['unit', 'integration', 'resilience', 'manual'].includes(p.layer) ? 'no suites' : `tests/${p.layer}/ does not exist`}.`); }
    else {
      console.log(`\n[${p.layer}] ${p.suites.length} suite(s)`);
      for (const s of p.suites) await runSuite(s);
      cleanup(dirtyBefore);
    }
  }
  const resultsById = new Map(records.filter(r => r.kind === 'suite').map(r => [r.id, r]));
  const catalogueIds = new Set(catalogue.suites.map(s => s.id));
  let guard = null;
  if (wantGuard) {
    const baseline = readJson(BASELINE_FILE, null);
    if (!baseline) { guard = { ok: false, findings: [{ id: '-', kind: 'no-baseline', message: `${BASELINE_FILE} is missing; create it with node scripts/test.mjs full --update-baseline.`, excused: false }], warnings: [] }; }
    else guard = evaluateGuard({ baseline, quarantine: readJson(QUARANTINE_FILE, { suites: {} }), results: resultsById, catalogueIds, planned: new Set(plan.flatMap(p => p.suites.map(s => s.id))) });
  }
  cleanup(dirtyBefore);
  summary = summarise({ guard, cleanup: { restoredTrackedFiles: [...new Set(cleaned.restored)], deletedUntrackedResultFiles: [...new Set(cleaned.deleted)] }, catalogue: summariseCatalogue(catalogue) });
  // summary.json is always the last invocation; summary-<layers>.json keeps one per layer selection (CI runs unit and smoke as separate steps).
  writeJson(`${REPORTS}/summary.json`, summary);
  writeJson(`${REPORTS}/summary-${requested.join('+').replace(/[^A-Za-z0-9+_-]/g, '_') || 'run'}${only.size ? '-only' : ''}.json`, summary);
  if (args.report) writeJson(resolve(args.report), summary);
  if (plan.length) printTable(summary);
  if (cleaned.otherChanged.length) console.log(`\nNote: ${new Set(cleaned.otherChanged).size} other tracked file(s) under tests/ changed while the run was going and were not restored: ${[...new Set(cleaned.otherChanged)].slice(0, 5).join(', ')}.`);
  if (cleaned.restored.length || cleaned.deleted.length) console.log(`\nRestored ${new Set(cleaned.restored).size} tracked file(s) and deleted ${new Set(cleaned.deleted).size} untracked result file(s) so the tree matches HEAD.`);
  if (guard) {
    console.log(`\nRegression guard: ${guard.ok ? 'passed' : 'FAILED'} (${guard.evaluated} baselined suite(s) checked, ${guard.findings.filter(f => f.excused).length} excused by quarantine).`);
    for (const f of guard.findings) console.log(`  ${f.excused ? 'excused ' : 'FAIL    '} ${f.message}`);
    for (const w of guard.warnings) console.log(`  warning  ${w}`);
    if (guard.newSuites?.length) console.log(`  note     ${guard.newSuites.length} suite(s) are not in the baseline yet (${guard.newSuites.slice(0, 6).join(', ')}${guard.newSuites.length > 6 ? ', ...' : ''}); add them with --update-baseline.`);
  }
  const updateFailed = args.flags.has('update-baseline') ? !applyBaselineUpdate(records.filter(r => r.kind === 'suite')) : false;
  const failed = summary.totals.failedSuites > 0 || records.some(r => r.kind === 'step' && r.status === 'failed') || (guard && !guard.ok) || updateFailed;
  process.exitCode = failed ? 1 : 0;
} catch (e) {
  console.error(e); cleanup(dirtyBefore); process.exitCode = 2;
}
