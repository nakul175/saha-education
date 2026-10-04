// Slice 11a: the suite catalogue. Classifies every runnable test file under tests/ into exactly one layer by explicit
// rules, and fails (checkCatalogue) when a file is unclassified or when the HTTP/D1 entry and its component modules
// disagree. scripts/test.mjs uses it to decide what to run; nothing here runs a test.
//
// Layers (see docs/current/SLICE-11A-TEST-RUNNER.md):
//   static       type check, documentation and requirement checks (commands, not files; defined in scripts/test.mjs)
//   unit         tests/*-contract.mjs, tests/*-client.mjs and three named suites: transpile lib/saha/*.ts and check with node:assert
//   integration  tests/run-api-smoke.mjs (HTTP + D1 against the built Worker) and tests/scheduled-local-check.mjs;
//                tests/api-smoke.mjs and tests/*-smoke.mjs are its entry and component modules, never run on their own
//   resilience   tests/recovery-drill.mjs (encrypted backup and restore)
//   smoke        tests/smoke/*.mjs        ui   tests/ui/        nfr   tests/nfr/*.mjs        uat   tests/uat/*.mjs
//   manual       run on purpose, never by default: tests/a11y-audit.mjs, tests/load-envelope.mjs, tests/adapter-overhead-bench.mjs
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';

export const LAYERS = ['static', 'unit', 'integration', 'resilience', 'smoke', 'ui', 'nfr', 'uat', 'manual'];
/** Layers whose suites are files found by scanning tests/ (static is a list of commands). */
export const FILE_LAYERS = LAYERS.filter(l => l !== 'static');
/** Layers a regression baseline can cover (manual suites are run on purpose and are not guarded). */
export const GUARDED_LAYERS = ['unit', 'integration', 'resilience', 'smoke', 'ui', 'nfr', 'uat'];

const SOURCE_EXT = /\.(mjs|cjs|js|mts|cts|ts|tsx)$/;
const SKIPPED_DIRS = new Set(['evidence', 'reports', 'node_modules', 'playwright-report', 'test-results', '.git']);
// The anaemia-provider demonstration (pull request #126) added an adapter suite that runs the real consumer code in workerd (Miniflare)
// against a deterministic local peer; it needs no build or network, so it is a unit suite.
const UNIT_NAMED = new Set(['tests/field-shell.mjs', 'tests/ehr-execution.mjs', 'tests/mis-delivery.mjs', 'tests/anaemia-worker-transport.mjs']);
/** Slice 11f: arguments a suite needs when the runner starts it. Generators run in their drift-check mode so a test run never rewrites
 * tracked documents; the hosted smoke runs its local self-test (the real hosted check runs after each deploy in deploy-staging.yml). */
export const SUITE_ARGS = {
  'tests/uat/generate-uat-pack.mjs': ['--check'],
  'tests/uat/coverage-map.mjs': ['--check'],
  'tests/smoke/hosted-smoke.mjs': ['--self-test'],
};
/** Slice 11f: the result file to read when a suite writes several. The hosted smoke's self-test also writes the nested reports of the
 * scenarios it expects to fail; only its own verdict counts. */
export const SUITE_RESULTS = {
  'tests/smoke/hosted-smoke.mjs': ['tests/reports/smoke-hosted-selftest-result.json'],
};
const MANUAL = {
  'tests/a11y-audit.mjs': { needsEnv: ['SAHA_A11Y_MODULES', 'SAHA_A11Y_CHROMIUM', 'SAHA_A11Y_ORIGIN'], note: 'axe over 66 screens; needs Playwright and axe-core installed outside the project and a running synthetic Worker (docs/current/DEVELOPMENT-AND-CI.md)' },
  'tests/load-envelope.mjs': { needsEnv: [], note: 'local load probe toward the BRD planning envelope; builds its own large synthetic database and takes many minutes; needs dist/' },
  'tests/adapter-overhead-bench.mjs': { needsEnv: [], note: 'local benchmark of per-adapter overhead; in-process, no Worker' },
  // Pull request #126 (independent anaemia-provider demonstration). Run on purpose by someone who has what each needs.
  'tests/run-anaemia-http.mjs': { needsEnv: [], note: 'reruns only the anaemia HTTP module against the existing .wrangler/test-state; the same checks run inside tests/run-api-smoke.mjs; needs dist/' },
  'tests/anaemia-ui.cjs': { needsEnv: [], directOnly: true, note: 'jsdom and canvas component checks of the anaemia panel; jsdom and @napi-rs/canvas are not project dependencies, so run it directly: node tests/anaemia-ui.cjs <path to jsdom> <path to @napi-rs/canvas>' },
  'tests/anaemia-connected-worker.mjs': { needsEnv: [], directOnly: true, note: 'built local Worker against the separately hosted private anaemia provider; reads service credentials on hidden stdin and writes tracked evidence, so only the credential holder runs it directly, never CI' },
  'tests/anaemia-hosted-connection.mjs': { needsEnv: [], directOnly: true, note: 'diagnostic of the two separately hosted private demonstrations; reads service credentials on hidden stdin and writes tracked evidence, so only the credential holder runs it directly, never CI' },
};

/** Files under tests/ that look like code, as sorted repository-relative POSIX paths. */
export function listTestFiles(root = process.cwd()) {
  const out = [];
  const walk = rel => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = posix.join(rel, e.name);
      if (e.isDirectory()) { if (!SKIPPED_DIRS.has(e.name)) walk(p); }
      else if (SOURCE_EXT.test(e.name)) out.push(p);
    }
  };
  if (existsSync(join(root, 'tests'))) walk('tests');
  return out.sort();
}

const isSupport = p => /(^|\/)(lib|fixtures|helpers|support|utils|pages|data)\//.test(p) || posix.basename(p).startsWith('_') || p === 'tests/database-fixtures.mjs';
const idOf = (layer, file) => `${layer}/${posix.basename(file).replace(SOURCE_EXT, '')}`;

/**
 * Classify one file. Returns null when no rule matches (an error in checkCatalogue).
 * { layer, role: 'suite' | 'component' | 'support', tier: 'pr' | 'extended' | 'manual', runner: 'node' | 'playwright' }
 */
export function classify(file) {
  const base = posix.basename(file);
  if (isSupport(file)) return { layer: null, role: 'support', tier: null, reason: 'shared helper, fixture or entry module; not a suite' };
  if (file === 'tests/api-smoke.mjs') return { layer: 'integration', role: 'support', tier: null, reason: 'entry module imported by tests/run-api-smoke.mjs; not run on its own' };
  if (file === 'tests/run-api-smoke.mjs') return { layer: 'integration', role: 'suite', tier: 'pr', runner: 'node', reason: 'HTTP and D1 suite against the built Worker' };
  if (file === 'tests/scheduled-local-check.mjs') return { layer: 'integration', role: 'suite', tier: 'extended', runner: 'node', reason: 'served-Worker check of the scheduled handler; needs dist/ and a port, so not a unit test' };
  if (file === 'tests/recovery-drill.mjs') return { layer: 'resilience', role: 'suite', tier: 'pr', runner: 'node', reason: 'encrypted backup and restore against the database the HTTP suite populated' };
  if (MANUAL[file]) return { layer: 'manual', role: 'suite', tier: 'manual', runner: 'node', reason: 'run on purpose, not by default' };
  const m = file.match(/^tests\/([^/]+)$/);
  if (m) {
    if (/-smoke\.mjs$/.test(base)) return { layer: 'integration', role: 'component', tier: null, via: 'tests/run-api-smoke.mjs', reason: 'module imported by tests/api-smoke.mjs; despite the name it is an HTTP/D1 integration test' };
    if (/-(contract|client)\.mjs$/.test(base) || UNIT_NAMED.has(file)) return { layer: 'unit', role: 'suite', tier: 'pr', runner: 'node', reason: 'transpiles lib/saha modules and checks them with node:assert' };
    return null;
  }
  const d = file.match(/^tests\/(smoke|nfr|uat|ui)\/(.+)$/);
  if (d) {
    const [, layer, rest] = d;
    if (layer === 'ui') {
      if (/^playwright\.config\.[mc]?[jt]s$/.test(rest)) return { layer, role: 'suite', tier: 'extended', runner: 'playwright', reason: 'Playwright configuration; the *.spec.* files are its components' };
      if (/\.(spec|test)\.[mc]?[jt]sx?$/.test(rest)) return { layer, role: 'component', tier: null, via: 'tests/ui/playwright.config', reason: 'Playwright spec run through the configuration' };
    }
    if (!rest.includes('/') && /\.mjs$/.test(rest)) return { layer, role: 'suite', tier: layer === 'smoke' ? 'pr' : 'extended', runner: 'node', reason: `${layer} suite` };
    return null;
  }
  return null;
}

/** Module paths imported by tests/api-smoke.mjs ('./x.mjs' strings, static or dynamic). */
export function importedModules(root = process.cwd()) {
  const p = join(root, 'tests/api-smoke.mjs');
  if (!existsSync(p)) return [];
  return [...new Set([...readFileSync(p, 'utf8').matchAll(/['"]\.\/([A-Za-z0-9_-]+\.mjs)['"]/g)].map(m => `tests/${m[1]}`))].sort();
}

/** requirement id -> evidence paths, as scripts/audit-requirements.mjs resolves them; returns Map<file, Set<requirement id>>. */
export function requirementsByFile(root = process.cwd()) {
  const map = new Map();
  const brd = join(root, 'requirements/brd-v1.1.json'), ev = join(root, 'requirements/evidence-map.json');
  if (!existsSync(brd) || !existsSync(ev)) return map;
  const ids = JSON.parse(readFileSync(brd, 'utf8')).requirements.map(r => r.id), evidence = JSON.parse(readFileSync(ev, 'utf8'));
  for (const id of ids) {
    const key = id.startsWith('NFR-') ? id : id.split('-').slice(0, 2).join('-');
    for (const path of evidence[id] ?? evidence[key] ?? []) { if (!map.has(path)) map.set(path, new Set()); map.get(path).add(id); }
  }
  return map;
}

/** Result-file names a suite is known to write, found in its own source (and its entry module). */
function resultHints(root, files) {
  const hints = new Set();
  for (const f of files) {
    if (!existsSync(join(root, f))) continue;
    // Only literal "tests/<name>-result.json" strings; the report library's tests/reports/ paths are found at run time.
    for (const m of readFileSync(join(root, f), 'utf8').matchAll(/['"`](tests\/[A-Za-z0-9_-]+-result\.json)['"`]/g)) hints.add(m[1]);
  }
  return [...hints];
}

/**
 * Scan tests/ and classify everything. Returns { entries, suites, components, support, errors, imported }:
 * entries: every classified file with { file, id, layer, role, tier, runner, results, requirements, ... }.
 * errors: strings; an empty list means the catalogue is complete and consistent.
 */
export function buildCatalogue(root = process.cwd()) {
  const files = listTestFiles(root), errors = [], entries = [];
  const reqs = requirementsByFile(root), imported = importedModules(root);
  const components = [];
  for (const file of files) {
    const c = classify(file);
    if (!c) { errors.push(`Unclassified test file: ${file}. Put it in tests/smoke, tests/ui, tests/nfr or tests/uat, name it *-contract.mjs / *-client.mjs, or add an explicit rule in scripts/test-catalogue.mjs.`); continue; }
    const entry = { file, id: c.role === 'suite' ? idOf(c.layer, file) : null, ...c };
    entries.push(entry);
    if (c.role === 'component') components.push(entry);
  }
  const byFile = new Map(entries.map(e => [e.file, e]));
  // The HTTP/D1 entry and its components must agree in both directions.
  const entry = byFile.get('tests/api-smoke.mjs'), runner = byFile.get('tests/run-api-smoke.mjs');
  if (!runner) errors.push('tests/run-api-smoke.mjs is missing: the HTTP/D1 suite has no entry point.');
  if (!entry) errors.push('tests/api-smoke.mjs is missing: the HTTP/D1 suite has no entry module.');
  if (entry) {
    for (const c of components.filter(c => c.layer === 'integration')) if (!imported.includes(c.file)) errors.push(`${c.file} is not imported by tests/api-smoke.mjs, so it never runs. Import it there, or rename it if it is not part of the HTTP/D1 suite.`);
    for (const m of imported) if (!existsSync(join(root, m))) errors.push(`tests/api-smoke.mjs imports ${m}, which does not exist.`);
  }
  for (const f of Object.keys(MANUAL)) if (!byFile.has(f)) errors.push(`${f} is a named manual suite but does not exist.`);
  for (const f of ['tests/recovery-drill.mjs']) if (!byFile.has(f)) errors.push(`${f} is a named suite but does not exist.`);
  const specs = entries.filter(e => e.layer === 'ui' && e.role === 'component'), configs = entries.filter(e => e.layer === 'ui' && e.runner === 'playwright');
  if (specs.length && !configs.length) errors.push(`tests/ui has ${specs.length} Playwright spec file(s) but no tests/ui/playwright.config.{mjs,js,ts}; add one so the runner can run them.`);
  if (configs.length > 1) errors.push(`More than one Playwright configuration: ${configs.map(c => c.file).join(', ')}.`);
  // Requirement ids: a suite cites what its own file cites; the HTTP/D1 suite also gets the entry module and every component.
  const cited = f => [...(reqs.get(f) ?? [])];
  for (const e of entries) {
    if (e.role === 'suite') {
      let from = [e.file];
      if (e.file === 'tests/run-api-smoke.mjs') from = [e.file, 'tests/api-smoke.mjs', ...components.map(c => c.file)];
      if (e.runner === 'playwright') from = [e.file, ...specs.map(c => c.file)];
      e.requirements = [...new Set(from.flatMap(cited))].sort();
      e.results = SUITE_RESULTS[e.file] ?? resultHints(root, e.file === 'tests/run-api-smoke.mjs' ? [e.file, 'tests/api-smoke.mjs'] : [e.file]);
      if (e.layer === 'manual') Object.assign(e, MANUAL[e.file]);
      // Suites that start the built Worker need dist/; unit suites, UAT generators, the in-process benchmark and the accessibility audit (which talks to a Worker you started) do not.
      e.needs = ['unit', 'uat'].includes(e.layer) || ['tests/adapter-overhead-bench.mjs', 'tests/a11y-audit.mjs'].includes(e.file) ? [] : ['build'];
    } else if (e.role === 'component') e.requirements = cited(e.file).sort();
  }
  const suites = entries.filter(e => e.role === 'suite');
  const ids = new Set();
  for (const s of suites) { if (ids.has(s.id)) errors.push(`Two suites share the id ${s.id}.`); ids.add(s.id); }
  return { entries, suites, components, support: entries.filter(e => e.role === 'support'), imported, errors };
}

/** Counts for the catalogue report: suites and components per layer, support files, requirement coverage. */
export function summariseCatalogue(cat) {
  const perLayer = Object.fromEntries(FILE_LAYERS.map(l => [l, { suites: 0, components: 0, citingNoRequirement: 0, requirementIds: new Set() }]));
  for (const e of cat.entries) {
    if (e.role === 'support' || !perLayer[e.layer]) continue;
    const l = perLayer[e.layer];
    if (e.role === 'suite') { l.suites++; if (!e.requirements.length) l.citingNoRequirement++; e.requirements.forEach(r => l.requirementIds.add(r)); }
    else l.components++;
  }
  const all = new Set(cat.suites.flatMap(s => s.requirements));
  return {
    layers: Object.fromEntries(Object.entries(perLayer).map(([k, v]) => [k, { suites: v.suites, components: v.components, suitesCitingNoRequirement: v.citingNoRequirement, requirementsCited: v.requirementIds.size }])),
    supportFiles: cat.support.length, suites: cat.suites.length, components: cat.components.length, requirementsCitedBySomeSuite: all.size,
    suitesCitingNoRequirement: cat.suites.filter(s => !s.requirements.length).length,
    componentsCitingNoRequirement: cat.components.filter(c => !c.requirements.length).length,
    requirementsCitedBySomeTest: new Set([...all, ...cat.components.flatMap(c => c.requirements)]).size,
  };
}
