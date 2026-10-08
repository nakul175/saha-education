#!/usr/bin/env node
// Deploy the synthetic demonstration to the sponsor's own Cloudflare account.
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/deploy-cloudflare.mjs
//   node scripts/deploy-cloudflare.mjs --dry-run        no account, no network: proves the deploy configuration packages
//
// What it does, in order (each step stops with a plain message on failure and never repeats a write blindly):
//   1. builds the Worker if dist/server has no build (or with --rebuild);
//   2. finds or creates one D1 database for the demo (default name saha-education-demo-db);
//   3. writes dist/server/wrangler.deploy.json: the built Worker config with this account's database and the demo switches
//      (SAHA_DEMO_ENABLED=true, a version 4 installation id). Real sign-in, reading-app sync, paid AI and delivery settings are
//      never written. The file lives in dist/, which git ignores;
//   4. applies the demo school (every migration plus invented records from scripts/seed-demo.mjs) to the remote database,
//      once; a database that already holds the demo school is left alone (use --reseed to delete and recreate the demo database);
//   5. deploys the Worker, reads the workers.dev address from Cloudflare, sets SAHA_ALLOWED_ORIGINS to that exact https
//      origin and deploys once more (the Worker refuses every write from another origin);
//   6. checks the live address: /login answers, a demo sign-in works for each of the four roles, a guardian is refused an
//      administrator page, and the response carries the security headers. Only then does it print the address.
//
// The demo is a public address with an "I understand these records are fictional" box and no passwords: anyone with the
// link can sign in as any of four invented people. Only synthetic data is ever loaded. Put Cloudflare Access (or another
// gate) in front of the address if the link will be shared widely; see docs/DEPLOY-CLOUDFLARE.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoSql, DEMO_INSTALLATION_ID } from './seed-demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const dryRun = flag('--dry-run');
const workerName = option('--name', 'saha-education-demo');
const databaseName = option('--db', 'saha-education-demo-db');
const fixedOrigin = option('--origin', '');
const anchor = option('--anchor', new Date().toISOString().slice(0, 10));
const dist = join(root, 'dist/server');
const builtConfig = join(dist, 'wrangler.json');
const deployConfig = join(dist, 'wrangler.deploy.json');
const wranglerBin = join(root, 'node_modules/wrangler/bin/wrangler.js');
const say = (text) => console.log(text);
const fail = (text) => {
  console.error('\n' + text);
  process.exit(1);
};
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(workerName))
  fail('--name must be lowercase letters, digits and hyphens.');
if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(databaseName))
  fail('--db must be lowercase letters, digits, hyphen or underscore.');
if (fixedOrigin) {
  try {
    const url = new URL(fixedOrigin);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) throw new Error();
  } catch {
    fail('--origin must be an https origin such as https://demo.example.org');
  }
}

// A school sign-in or provider setting in the environment would switch demo mode off or reach a real service: never inherit one.
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
for (const name of Object.keys(env)) if (/^SAHA_(OIDC|ORF|AI|MAIL|SMS)/.test(name)) delete env[name];
if (!dryRun) {
  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'])
    if (!env[name])
      fail(
        `${name} is not set. Create a token limited to Workers Scripts and D1 (edit) for one account and export both values; see docs/DEPLOY-CLOUDFLARE.md. Use --dry-run to check the packaging without an account.`,
      );
  if (!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID))
    fail('CLOUDFLARE_ACCOUNT_ID should be the 32-character account id.');
}

function wrangler(wranglerArgs, { capture = false, label } = {}) {
  const result = spawnSync(process.execPath, [wranglerBin, ...wranglerArgs], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    if (capture) console.error((result.stdout ?? '') + (result.stderr ?? ''));
    fail(
      `${label ?? 'A Cloudflare step'} did not finish (exit ${result.status}). Nothing after it was attempted. Fix the message above and run the command again; completed steps are safe to repeat.`,
    );
  }
  return result.stdout ?? '';
}

// 1. Build.
if (flag('--rebuild') || !existsSync(builtConfig)) {
  say('Building the application (a few minutes)...');
  const built = spawnSync(process.execPath, ['scripts/run-framework.mjs', 'build'], {
    cwd: root,
    env,
    stdio: 'inherit',
  });
  if (built.status !== 0 || !existsSync(builtConfig)) fail('The build did not finish.');
}
const base = JSON.parse(readFileSync(builtConfig, 'utf8'));
if (!base.no_bundle || base.main !== 'index.js')
  fail('Unexpected build output: dist/server/wrangler.json is not the prebuilt Worker the deploy expects.');

function writeDeployConfig(databaseId, allowedOrigin) {
  const vars = { SAHA_DEMO_ENABLED: 'true', SAHA_DEMO_INSTALLATION_ID: DEMO_INSTALLATION_ID };
  if (allowedOrigin) vars.SAHA_ALLOWED_ORIGINS = allowedOrigin;
  const config = {
    ...base,
    name: workerName,
    topLevelName: workerName,
    vars: { ...(base.vars ?? {}), ...vars },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: databaseId }],
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: true },
  };
  delete config.dev;
  writeFileSync(deployConfig, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

if (dryRun) {
  writeDeployConfig('00000000-0000-4000-8000-000000000000', 'https://example.invalid');
  const out = join(dist, 'dry-run-out');
  mkdirSync(out, { recursive: true });
  say('Dry run: packaging the Worker with the deploy configuration (no account, nothing is uploaded)...');
  wrangler(['deploy', '--config', deployConfig, '--dry-run', '--outdir', out], {
    capture: true,
    label: 'The dry-run packaging',
  });
  const seed = demoSql({ anchor, installationId: DEMO_INSTALLATION_ID, withSchema: true });
  const checks = [
    ['deploy config names the Worker', JSON.parse(readFileSync(deployConfig, 'utf8')).name === workerName],
    [
      'demo switch is on and no real-provider setting is present',
      (() => {
        const v = JSON.parse(readFileSync(deployConfig, 'utf8')).vars;
        return v.SAHA_DEMO_ENABLED === 'true' && !Object.keys(v).some((k) => /OIDC|ORF|AI|MAIL|SMS/.test(k));
      })(),
    ],
    [
      'demo seed holds every migration and the invented school',
      seed.sql.includes('CREATE TABLE') && seed.sql.includes('saha-demo-school'),
    ],
    ['demo seed carries no session or credential rows', !/INSERT INTO sessions/i.test(seed.sql)],
  ];
  for (const [name, ok] of checks) say(`${ok ? 'ok' : 'FAILED'} - ${name}`);
  if (checks.some(([, ok]) => !ok)) process.exit(1);
  say(
    `\nDry run passed. Seed size ${Math.round(seed.sql.length / 1024)} KiB. To deploy for real, export CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID and run this command without --dry-run.`,
  );
  process.exit(0);
}

// 2. Database.
say(`Looking for the D1 database "${databaseName}"...`);
const listed = JSON.parse(
  wrangler(['d1', 'list', '--json'], { capture: true, label: 'Listing databases' }) || '[]',
);
let database = listed.find((row) => row.name === databaseName);
let created = false;
if (database && flag('--reseed')) {
  say('--reseed: deleting the demo database so it can be recreated (it holds only invented records)...');
  wrangler(['d1', 'delete', databaseName, '--skip-confirmation'], { label: 'Deleting the demo database' });
  database = undefined;
}
if (!database) {
  say('Creating it...');
  wrangler(['d1', 'create', databaseName], { capture: true, label: 'Creating the database' });
  database = JSON.parse(
    wrangler(['d1', 'list', '--json'], { capture: true, label: 'Listing databases' }),
  ).find((row) => row.name === databaseName);
  created = true;
}
const databaseId = database?.uuid ?? database?.id;
if (!databaseId) fail('Cloudflare did not return an id for the database.');
writeDeployConfig(databaseId, fixedOrigin);

// 3. Demo school.
const marker = join(dist, `.demo-seeded-${databaseId}`);
if (flag('--reseed') || created || !existsSync(marker)) {
  say('Loading the invented school (every migration, then the demo records)...');
  const seed = join(dist, 'demo-seed.sql');
  writeFileSync(seed, demoSql({ anchor, installationId: DEMO_INSTALLATION_ID, withSchema: true }).sql, {
    mode: 0o600,
  });
  wrangler(['d1', 'execute', databaseName, '--config', deployConfig, '--remote', '--yes', '--file', seed], {
    label: 'Loading the demo school',
  });
  writeFileSync(marker, new Date().toISOString() + '\n');
} else say('The demo school is already loaded here; leaving it alone (use --reseed to recreate it).');

// 4. Deploy, learn the address, pin the origin, deploy again.
say('Deploying the Worker...');
const first = wrangler(['deploy', '--config', deployConfig], { capture: true, label: 'Deploying' });
const found = (first.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i) ?? [])[0];
const origin = fixedOrigin ? new URL(fixedOrigin).origin : found ? new URL(found).origin : '';
if (!origin)
  fail(
    'The deploy finished but Cloudflare did not print a workers.dev address. Pass --origin https://your-address and run again.',
  );
if (origin !== fixedOrigin) {
  writeDeployConfig(databaseId, origin);
  say(`Pinning the allowed origin to ${origin} and deploying again...`);
  wrangler(['deploy', '--config', deployConfig], {
    capture: true,
    label: 'Deploying with the allowed origin',
  });
}

// 5. Check the live address before claiming anything.
say(`Checking ${origin} ...`);
const results = [];
const note = (name, ok, detail = '') => {
  results.push([name, ok, detail]);
  say(`${ok ? 'ok' : 'FAILED'} - ${name}${detail ? ' (' + detail + ')' : ''}`);
};
async function get(path, init = {}, tries = 6) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...init });
    } catch (error) {
      if (attempt >= tries) throw error;
      await new Promise((done) => setTimeout(done, 5000));
    }
  }
}
try {
  const login = await get('/login');
  note('The sign-in page answers', login.status === 200, 'status ' + login.status);
  note(
    'Security headers are present',
    Boolean(login.headers.get('content-security-policy')) &&
      login.headers.get('x-frame-options') === 'DENY' &&
      login.headers.get('x-content-type-options') === 'nosniff',
  );
  const sessions = {};
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    const response = await get('/api/demo', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ role, syntheticAcknowledged: true }),
    });
    const cookie = (response.headers.getSetCookie?.() ?? [])
      .map((line) => line.split(';')[0])
      .find((pair) => pair.startsWith('__Host-saha_session='));
    note(`Demo sign-in as ${role}`, response.status === 200 && Boolean(cookie), 'status ' + response.status);
    if (cookie) sessions[role] = cookie;
  }
  if (sessions.admin) {
    const session = await get('/api/session', { headers: { cookie: sessions.admin } });
    const body = await session.json().catch(() => ({}));
    note('The administrator session is recognised with its role', JSON.stringify(body).includes('admin'));
    const students = await get('/api/students', { headers: { cookie: sessions.admin } });
    const rows = await students.json().catch(() => []);
    note(
      'The invented school is loaded (40 students)',
      Array.isArray(rows) ? rows.length === 40 : (rows.items?.length ?? 0) === 40,
      'got ' + (Array.isArray(rows) ? rows.length : rows.items?.length),
    );
  }
  if (sessions.guardian) {
    const denied = await get('/api/admin/users', { headers: { cookie: sessions.guardian } });
    note('A guardian is refused the administrator list', denied.status === 403, 'status ' + denied.status);
    const crossOrigin = await get('/api/notices', {
      method: 'POST',
      headers: {
        cookie: sessions.admin ?? '',
        origin: 'https://example.invalid',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    note(
      'A write from another origin is refused',
      crossOrigin.status === 403,
      'status ' + crossOrigin.status,
    );
  }
} catch (error) {
  note('The live address could be reached', false, String(error?.message ?? error));
}
if (results.some(([, ok]) => !ok))
  fail(`Deployed, but the live checks did not all pass. Do not share ${origin} yet.`);
say(
  `\nThe demo is live and the checks above passed:\n\n  ${origin}/login\n\nTick the fictional-records box and choose a role. docs/DEPLOY-CLOUDFLARE.md explains access control and how to remove it.`,
);
