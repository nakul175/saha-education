#!/usr/bin/env node
// One-command local demonstration: pnpm demo
//
// Builds the Worker if there is no build, creates a local D1 database from every migration plus the synthetic
// school in scripts/seed-demo.mjs, starts the local Worker with the demo switches on and prints the sign-in page.
// Everything stays on this computer. No identity provider, paid AI service or real message is used.
//
//   pnpm demo                      first run builds, creates the database and starts on port 8787
//   pnpm demo -- --port 8810       choose a port
//   pnpm demo -- --reset           throw the local demo database away and create it again
//   pnpm demo -- --rebuild         build again before starting
//   pnpm demo -- --anchor 2026-10-06   pin the term dates (default: today)
//   pnpm demo -- --prepare-only    create the database and print the commands, but do not start the Worker
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoSql, DEMO_INSTALLATION_ID } from './seed-demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(arg => arg !== '--');
const flag = name => args.includes(name);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) { console.error(`Node 22.13 or newer is needed (this is ${process.versions.node}).`); process.exit(1); }

const port = Number(option('--port', '8787'));
if (!Number.isInteger(port) || port < 1024 || port > 65535) { console.error('Choose a port between 1024 and 65535, for example --port 8787.'); process.exit(1); }
const state = resolve(root, option('--state', '.wrangler/demo'));
const config = join(root, 'dist/server/wrangler.json');
const wrangler = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js'];
const quiet = { ...process.env };
// A school sign-in setting would switch the demo off, so the demo never inherits one.
for (const name of Object.keys(quiet)) if (name.startsWith('SAHA_OIDC_')) delete quiet[name];

function run(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit', env: quiet });
  if (result.status !== 0) { console.error(`\n${label} did not finish. Fix the message above, then run pnpm demo again.`); process.exit(result.status ?? 1); }
}

if (flag('--rebuild') || !existsSync(config)) {
  console.log('Building the application (this takes a few minutes the first time)...');
  run(process.execPath, ['scripts/run-framework.mjs', 'build'], 'The build');
}
if (!existsSync(config)) { console.error('The build did not produce dist/server/wrangler.json.'); process.exit(1); }

if (flag('--reset')) rmSync(state, { recursive: true, force: true });
const marker = join(state, 'demo.json');
let info;
if (existsSync(marker)) {
  info = JSON.parse(readFileSync(marker, 'utf8'));
  console.log(`Using the existing demo database (term dates from ${info.anchor}). Use --reset for a fresh one.`);
} else {
  mkdirSync(state, { recursive: true });
  const anchor = option('--anchor', new Date().toISOString().slice(0, 10));
  const made = demoSql({ anchor, installationId: DEMO_INSTALLATION_ID, withSchema: true });
  const file = join(state, 'seed.sql');
  writeFileSync(file, made.sql, { mode: 0o600 });
  console.log(`Creating the local demo database: ${made.manifest.counts.learners} learners, ${made.manifest.counts.attendance} attendance records, ${made.manifest.counts.readingChecks} reading checks...`);
  run(process.execPath, [...wrangler, 'd1', 'execute', 'DB', '--config', config, '--local', '--persist-to', join(state, 'd1'), '--file', file], 'Creating the database');
  info = { anchor, installationId: DEMO_INSTALLATION_ID, createdAt: new Date().toISOString() };
  writeFileSync(marker, JSON.stringify(info, null, 2) + '\n');
}

const origin = `http://127.0.0.1:${port}`;
const serveArgs = [...wrangler, 'dev', '--config', config, '--local', '--persist-to', join(state, 'd1'), '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0',
  '--var', `SAHA_ALLOWED_ORIGINS:${origin}`, '--var', 'SAHA_DEMO_ENABLED:true', '--var', `SAHA_DEMO_INSTALLATION_ID:${info.installationId}`];
if (flag('--prepare-only')) {
  console.log('\nDatabase is ready. Start the Worker with:\n  node ' + serveArgs.map(a => (a.includes(':') ? JSON.stringify(a) : a)).join(' '));
  process.exit(0);
}
const child = spawn(process.execPath, serveArgs, { cwd: root, env: quiet, stdio: ['ignore', 'pipe', 'pipe'], detached: false });
let log = '';
child.stdout.on('data', chunk => { log += chunk; if (flag('--verbose')) process.stdout.write(chunk); });
child.stderr.on('data', chunk => { log += chunk; if (flag('--verbose')) process.stderr.write(chunk); });
child.on('exit', code => { if (!ready) { console.error('The Worker stopped before it was ready.\n' + log.split('\n').slice(-15).join('\n')); } process.exit(code ?? 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill('SIGTERM'); setTimeout(() => process.exit(0), 1500).unref(); });
let ready = false;
for (let attempt = 0; attempt < 120 && !ready; attempt++) {
  await new Promise(done => setTimeout(done, 1000));
  try { ready = (await fetch(origin + '/login', { signal: AbortSignal.timeout(3000) })).ok; } catch { /* still starting */ }
}
if (!ready) { console.error('The Worker did not answer in two minutes.\n' + log.split('\n').slice(-15).join('\n')); child.kill('SIGTERM'); process.exit(1); }
console.log(`
Saha Education demo is running. All people, classes and records are invented.

  Open:  ${origin}/login
  Then tick the fictional-records box and choose a role:
    Administrator   sees school totals, accounts and report publishing
    Teacher         takes attendance, enters results, plans reading practice
    Guardian        sees linked children, attendance, results and published reports
    Student         sees class resources and own progress

  A five-minute walkthrough is in docs/DEMO.md. Press Ctrl-C to stop.
`);
