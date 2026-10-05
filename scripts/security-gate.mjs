// Slice 0c supply-chain gate (BR-SEC-12). Run after `npm run build`:
//   node scripts/security-gate.mjs [--sbom path] [--report path]
// 1. Writes a CycloneDX 1.5 SBOM of production dependencies (pnpm list --prod).
// 2. Runs `pnpm audit` and fails on any critical advisory, and on any high advisory whose
//    package is present in the built Worker or client bundle (dist/). High advisories confined
//    to development or build-time tooling are reported, not failed; the report lists them so a
//    reviewer can see what was accepted and why.
// The gate needs registry access for the audit. Without it the gate fails closed.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const sbomPath = arg('--sbom', 'dist/sbom.cdx.json'), reportPath = arg('--report', 'dist/security-gate.json');
const pnpm = args => execFileSync('corepack', ['pnpm', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
if (!existsSync('dist')) { console.error('Build first: dist/ is missing.'); process.exit(2); }

// SBOM of production dependencies.
const tree = JSON.parse(pnpm(['list', '--prod', '--json', '--depth', 'Infinity']))[0];
const components = new Map();
const walk = deps => { for (const [name, info] of Object.entries(deps ?? {})) { const key = `${name}@${info.version}`; if (components.has(key)) continue; components.set(key, { type: 'library', name, version: info.version, purl: `pkg:npm/${name.startsWith('@') ? '%40' + name.slice(1) : name}@${info.version}`, scope: 'required' }); walk(info.dependencies); } };
walk(tree.dependencies);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const sbom = { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, metadata: { timestamp: new Date().toISOString(), component: { type: 'application', name: 'saha-health', version: pkg.version } }, components: [...components.values()].sort((a, b) => a.purl.localeCompare(b.purl)) };
mkdirSync(dirname(sbomPath), { recursive: true });
writeFileSync(sbomPath, JSON.stringify(sbom, null, 2) + '\n');

// Built bundle text, to decide whether a flagged package actually ships.
const bundle = [];
const outputs = new Set([sbomPath, reportPath].map(p => join(p)));
const collect = d => { for (const f of readdirSync(d)) { const p = join(d, f); if (outputs.has(p)) continue; if (statSync(p).isDirectory()) collect(p); else if (/\.(m?js|cjs|json|html|css)$/.test(f)) bundle.push(readFileSync(p, 'utf8')); } };
collect('dist');
const shipped = name => bundle.some(text => text.includes(`node_modules/${name}/`) || text.includes(`"${name}"`) || text.includes(`'${name}'`));

let audit;
try { audit = JSON.parse(pnpm(['audit', '--json'])); } catch (e) {
  // pnpm audit exits non-zero when advisories exist; its JSON is still on stdout.
  if (e.stdout) audit = JSON.parse(e.stdout); else { console.error('Dependency audit unavailable; failing closed.'); process.exit(3); }
}
const findings = Object.values(audit.advisories ?? {}).map(a => ({ id: a.id, module: a.module_name, severity: a.severity, vulnerable: a.vulnerable_versions, devOnly: a.findings.every(f => f.dev), shipped: shipped(a.module_name), title: a.title }));
const blocking = findings.filter(f => f.severity === 'critical' || (f.severity === 'high' && f.shipped));
const report = { gate: 'supply-chain (slice 0c)', sbom: sbomPath, productionComponents: components.size, counts: audit.metadata?.vulnerabilities ?? {}, blocking, accepted: findings.filter(f => !blocking.includes(f) && ['high', 'moderate'].includes(f.severity)).map(f => ({ ...f, reason: f.devOnly ? 'development tooling only' : 'build-time dependency not present in dist/' })), passed: blocking.length === 0, checkedAt: new Date().toISOString() };
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ passed: report.passed, productionComponents: report.productionComponents, counts: report.counts, blocking: blocking.length, accepted: report.accepted.length }));
process.exit(report.passed ? 0 : 1);
