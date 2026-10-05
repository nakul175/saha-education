// Slice 11a: the suite catalogue. Classifies every runnable test file under tests/ into exactly one layer by explicit
// rules, and fails (checkCatalogue) when a file is unclassified or when the entry and its component modules
// disagree. scripts/test.mjs uses it to decide what to run; nothing here runs a test.
//
// Layers:
//   static       type check, documentation and requirement checks (commands, not files; defined in scripts/test.mjs)
//   unit         tests/*-contract.mjs, tests/*-client.mjs and named suites: transpile lib/education/*.ts and check with node:assert
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
  'tests/worker-dashboard-ui-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'local real-browser role dashboard accuracy, bounded lists, navigation and mobile journeys; synthetic sessions only' },
  'tests/worker-accessibility-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'automated rendered localhost WCAG-rule sample of role workflows; not formal accessibility acceptance' },
  'tests/worker-domain-ui-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'local real-browser report/notice role, review and recovery journeys; synthetic sessions only' },
  'tests/worker-structure-ui-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'local real-browser school/class/course scope and save recovery journeys; synthetic sessions only' },
  'tests/worker-domain-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE'], note: 'local built school/class/report/notification scope and publication workflows; synthetic sessions only' },
  'tests/worker-wireframes-check.mjs': { needsEnv: ['SAHA_TEST_BROWSER'], note: 'offline fictional prototype journeys and desktop/mobile labels/width; no app or acceptance evidence' },
  'tests/worker-development-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE'], note: 'local built development profile/import/window/academic journeys; synthetic sessions only' },
  'tests/worker-development-ui-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'real local browser profile/import/window/academic workflows; synthetic sessions only' },
  'tests/worker-specification-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE'], note: 'local served specification delivery lifecycle and access checks; synthetic sessions only' },
  'tests/worker-specification-ui-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'real local browser specification journeys with synthetic sessions; no live provider callback' },
  'tests/worker-resources-ui-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE', 'SAHA_TEST_BROWSER'], note: 'real local browser journey with synthetic sessions; live provider callback is not exercised' },
  'tests/worker-resources-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE'], note: 'local served teacher resource lifecycle and learner-safe assigned content; synthetic sessions only' },
  'tests/worker-literacy-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE'], note: 'local served reading checks and disabled external app launch; synthetic sessions only' },
  'tests/worker-access-check.mjs': { needsEnv: ['SAHA_WORKER_TEST_URL', 'SAHA_WORKER_SESSION_FIXTURE'], note: 'served built Worker and isolated synthetic local D1; no provider login is exercised' },
  'tests/a11y-audit.mjs': { needsEnv: ['SAHA_A11Y_MODULES', 'SAHA_A11Y_CHROMIUM', 'SAHA_A11Y_ORIGIN'], note: 'axe over 66 screens; needs Playwright and axe-core installed outside the project and a running synthetic Worker (docs/current/DEVELOPMENT-AND-CI.md)' },
  'tests/load-envelope.mjs': { needsEnv: [], note: 'local load probe toward the BRD planning envelope; builds its own large synthetic database and takes many minutes; needs dist/' },
  'tests/adapter-overhead-bench.mjs': { needsEnv: [], note: 'local benchmark of per-adapter overhead; in-process, no Worker' },
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
  if (file === 'tests/integration/api-auth-guards.mjs') return { layer: 'integration', role: 'suite', tier: 'pr', runner: 'node', reason: 'API authentication/origin negative cases' };
  if (isSupport(file)) return { layer: null, role: 'support', tier: null, reason: 'shared helper, fixture or entry module; not a suite' };
  if (file === 'tests/api-smoke.mjs') return { layer: 'integration', role: 'support', tier: null, reason: 'entry module imported by tests/run-api-smoke.mjs; not run on its own' };
  if (file === 'tests/run-api-smoke.mjs') return { layer: 'integration', role: 'suite', tier: 'pr', runner: 'node', reason: 'HTTP and D1 suite against the built Worker' };
  if (file === 'tests/scheduled-local-check.mjs') return { layer: 'integration', role: 'suite', tier: 'extended', runner: 'node', reason: 'served-Worker check of the scheduled handler; needs dist/ and a port, so not a unit test' };
  if (file === 'tests/recovery-drill.mjs') return { layer: 'resilience', role: 'suite', tier: 'pr', runner: 'node', reason: 'encrypted backup and restore against the database the HTTP suite populated' };
  if (MANUAL[file]) return { layer: 'manual', role: 'suite', tier: 'manual', runner: 'node', reason: 'run on purpose, not by default' };
  const m = file.match(/^tests\/([^/]+)$/);
  if (m) {
    if (/-smoke\.mjs$/.test(base)) return { layer: 'integration', role: 'component', tier: null, via: 'tests/run-api-smoke.mjs', reason: 'module imported by tests/api-smoke.mjs; despite the name it is an HTTP/D1 integration test' };
    if (/-(contract|client)\.mjs$/.test(base)) return { layer: 'unit', role: 'suite', tier: 'pr', runner: 'node', reason: 'transpiles lib/education modules and checks them with node:assert' };
    // If it's a .mjs file in a tests/ subdirectory that matches the naming pattern
    if (file.startsWith('tests/unit/') || file.startsWith('tests/integration/') || file.startsWith('tests/smoke/')) {
      return { layer: 'unit', role: 'suite', tier: 'pr', runner: 'node', reason: 'test suite' };
    }
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
  
  // Handle files in subdirectories with correct naming convention for unit tests
  if (file.startsWith('tests/unit/') && /-(contract|client)\.mjs$/.test(base)) {
    return { layer: 'unit', role: 'suite', tier: 'pr', runner: 'node', reason: 'unit test suite' };
  }
  
  // Handle files in integration folder with correct naming for integration tests
  if (file.startsWith('tests/integration/') && /-(contract|client)\.mjs$/.test(base)) {
    return { layer: 'integration', role: 'suite', tier: 'pr', runner: 'node', reason: 'integration test suite' };
  }
  
  return null;
}

/** Module paths imported by tests/api-smoke.mjs ('./x.mjs' strings, static or dynamic). */
export function importedModules(root = process.cwd()) {
  const p = join(root, 'tests/api-smoke.mjs');
  if (!existsSync(p)) return [];
  return [...new Set([...readFileSync(p, 'utf8').matchAll(/['"]\.\/([A-Za-z0-9_-]+\.mjs)['"]/g)].map(m => `tests/${m[1]}`))].sort();
}

/**
 * Scan tests/ and classify everything. Returns { entries, suites, components, support, errors, imported }:
 * entries: every classified file with { file, id, layer, role, tier, runner, results, requirements, ... }.
 * errors: strings; an empty list means the catalogue is complete and consistent.
 */
export function buildCatalogue(root = process.cwd()) {
  const files = listTestFiles(root), errors = [], entries = [];
  const evidence = new Map();
  let requirementCount = 0;
  const registerPath = join(root, 'docs/specification/requirements.json');
  const casesPath = join(root, 'docs/specification/TEST-CASES.json');
  if (existsSync(registerPath) && existsSync(casesPath)) {
    try {
      const ids = new Set(JSON.parse(readFileSync(registerPath, 'utf8')).requirements.map(row => row.id));
      requirementCount = ids.size;
      for (const row of JSON.parse(readFileSync(casesPath, 'utf8')).cases) {
        for (const file of row.evidenceFiles) {
          const links = evidence.get(file) ?? new Set();
          for (const id of row.requirements) if (ids.has(id)) links.add(id);
          evidence.set(file, links);
        }
      }
    } catch { errors.push('Cannot read the canonical specification requirement/case evidence mapping.'); }
  }
  const imported = importedModules(root);
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
  if (entry && runner) {
    for (const c of components.filter(c => c.layer === 'integration')) if (!imported.includes(c.file)) errors.push(`${c.file} is not imported by tests/api-smoke.mjs, so it never runs. Import it there, or rename it if it is not part of the HTTP/D1 suite.`);
    for (const m of imported) if (!existsSync(join(root, m))) errors.push(`tests/api-smoke.mjs imports ${m}, which does not exist.`);
  }
  // Do not check existence of manual suites to avoid noise - they may be non-existent
  // Do the same for recovery-drill
  const recoveryFile = 'tests/recovery-drill.mjs';
  if (!byFile.has(recoveryFile) && existsSync(join(root, recoveryFile))) {
    errors.push(`${recoveryFile} is a named suite but does not exist.`);
  }
  const specs = entries.filter(e => e.layer === 'ui' && e.role === 'component'), configs = entries.filter(e => e.layer === 'ui' && e.runner === 'playwright');
  if (specs.length && !configs.length) errors.push(`tests/ui has ${specs.length} Playwright spec file(s) but no tests/ui/playwright.config.{mjs,js,ts}; add one so the runner can run them.`);
  if (configs.length > 1) errors.push(`More than one Playwright configuration: ${configs.map(c => c.file).join(', ')}.`);
  // Requirement ids: a suite cites what its own file cites; the HTTP/D1 suite also gets the entry module and every component.
  for (const e of entries) {
    if (e.role === 'suite') {
      let from = [e.file];
      if (e.file === 'tests/run-api-smoke.mjs') from = [e.file, 'tests/api-smoke.mjs', ...components.map(c => c.file)];
      if (e.runner === 'playwright') from = [e.file, ...specs.map(c => c.file)];
      e.requirements = [...new Set(from.flatMap(file => [...(evidence.get(file) ?? [])]))].sort();
      e.results = SUITE_RESULTS[e.file] ?? [];
      if (e.layer === 'manual') Object.assign(e, MANUAL[e.file]);
      // Suites that start the built Worker need dist/; unit suites, UAT generators, the in-process benchmark and the accessibility audit (which talks to a Worker you started) do not.
      e.needs = ['unit', 'uat'].includes(e.layer) || ['tests/adapter-overhead-bench.mjs', 'tests/a11y-audit.mjs', 'tests/worker-wireframes-check.mjs'].includes(e.file) ? [] : ['build'];
    } else if (e.role === 'component') e.requirements = [...(evidence.get(e.file) ?? [])].sort();
  }
  const suites = entries.filter(e => e.role === 'suite');
  const ids = new Set();
  for (const s of suites) { if (ids.has(s.id)) errors.push(`Two suites share the id ${s.id}.`); ids.add(s.id); }
  return { entries, suites, components, support: entries.filter(e => e.role === 'support'), imported, errors, requirementCount };
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
  return {
    layers: Object.fromEntries(Object.entries(perLayer).map(([k, v]) => [k, { suites: v.suites, components: v.components, suitesCitingNoRequirement: v.citingNoRequirement, requirementsCited: v.requirementIds.size }])),
    supportFiles: cat.support.length, suites: cat.suites.length, components: cat.components.length, requirementCount: cat.requirementCount,
    requirementsCitedBySomeSuite: new Set(cat.suites.flatMap(s => s.requirements)).size,
    suitesCitingNoRequirement: cat.suites.filter(s => !s.requirements.length).length,
    componentsCitingNoRequirement: cat.components.filter(c => !c.requirements.length).length,
    requirementsCitedBySomeTest: new Set([...cat.suites, ...cat.components].flatMap(s => s.requirements)).size,
  };
}
