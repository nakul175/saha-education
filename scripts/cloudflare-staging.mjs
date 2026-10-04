// Hosted synthetic staging on Cloudflare (sponsor instruction, 1 October 2026).
//
//   node scripts/cloudflare-staging.mjs database   find or create the staging D1 database
//   node scripts/cloudflare-staging.mjs configure  rewrite dist/server/wrangler.json for the hosted Worker
//   node scripts/cloudflare-staging.mjs check URL  confirm the live Worker is not readable without sign-in
//
// The hosted Worker always trusts Cloudflare Access only (never the Sites identity headers), runs in a
// synthetic or training environment, keeps external APIs off and serves only its workers.dev address.
// Until the Access team domain and audience are recorded in deploy/cloudflare-staging.json the Worker
// answers 503 "Sign-in is not configured" (slice 0c fails closed), so a first deploy exposes no data.
// Slice 10a: the hosted Worker also carries a Cloudflare Cron Trigger (`triggers.crons`, every five minutes unless
// `scheduledCron` in deploy/cloudflare-staging.json says otherwise; an empty value turns the trigger off) that runs the
// scheduled job (worker/index.ts, lib/saha/scheduled-job.ts). The job never calls an external service.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const CONFIG = 'deploy/cloudflare-staging.json';
const BUILT = 'dist/server/wrangler.json';
const WRANGLER = ['node_modules/wrangler/bin/wrangler.js'];
export const SCHEDULED_CRON = '*/5 * * * *';
const CRON_FIELD = /^[0-9*/,-]+( [0-9*/,-]+){4}$/;
const fail = message => { console.error(`cloudflare-staging: ${message}`); process.exit(1); };

export function readConfig(text = readFileSync(CONFIG, 'utf8')) {
  const c = JSON.parse(text);
  if (!/^[a-z0-9-]{1,54}$/.test(c.workerName ?? '')) throw new Error('workerName must be lowercase letters, digits or hyphens.');
  if (!/^[a-z0-9-]{1,54}$/.test(c.d1DatabaseName ?? '')) throw new Error('d1DatabaseName must be lowercase letters, digits or hyphens.');
  if (!['synthetic', 'training'].includes(c.environment)) throw new Error('environment must be synthetic or training: this host is not accepted for real patient data.');
  if (c.accountId && !/^[a-f0-9]{32}$/.test(c.accountId)) throw new Error('accountId must be the 32-character Cloudflare account ID.');
  const team = String(c.accessTeamDomain ?? '').trim().toLowerCase(), aud = String(c.accessAud ?? '').trim();
  if (team && !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) throw new Error('accessTeamDomain must be <team>.cloudflareaccess.com.');
  if (aud && !/^[a-f0-9]{32,128}$/.test(aud)) throw new Error('accessAud must be the Access application audience tag.');
  if (!!team !== !!aud) throw new Error('Set accessTeamDomain and accessAud together.');
  // Slice 10a: the scheduled job's cron expression; absent means every five minutes, an empty string means no trigger.
  const cron = c.scheduledCron === undefined ? SCHEDULED_CRON : String(c.scheduledCron).trim();
  if (cron && !CRON_FIELD.test(cron)) throw new Error('scheduledCron must be a five-field cron expression, or empty for no trigger.');
  return { ...c, accessTeamDomain: team, accessAud: aud, scheduledCron: cron };
}

export function hostedWorkerConfig(built, c, databaseId) {
  if (!/^[0-9a-f-]{36}$/.test(databaseId ?? '')) throw new Error('A D1 database ID is required.');
  const out = { ...built, name: c.workerName, workers_dev: true, preview_urls: false };
  delete out.routes; delete out.route;
  out.d1_databases = [{ binding: 'DB', database_name: c.d1DatabaseName, database_id: databaseId, migrations_dir: '../../drizzle' }];
  out.vars = {
    SAHA_ENVIRONMENT: c.environment,
    SAHA_IDENTITY_PROVIDER: 'cloudflare-access',
    SAHA_ACCESS_TEAM_DOMAIN: c.accessTeamDomain,
    SAHA_ACCESS_AUD: c.accessAud,
    SAHA_EXTERNAL_APIS_ENABLED: 'false',
    SAHA_MIS_CONNECTIONS: '[]',
    SAHA_EHR_CONNECTIONS: '[]',
  };
  // Slice 10a: the Cron Trigger that runs the scheduled job; the built configuration carries no trigger of its own.
  out.triggers = { crons: c.scheduledCron ? [c.scheduledCron] : [] };
  if (c.accountId) out.account_id = c.accountId;
  return out;
}

function wrangler(args, options = {}) {
  return execFileSync('node', [...WRANGLER, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options });
}

function findDatabase(name) {
  const list = JSON.parse(wrangler(['d1', 'list', '--json']));
  return list.find(d => d.name === name)?.uuid ?? null;
}

async function check(url) {
  if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev\/?$/.test(url ?? '')) fail('check needs the https://<name>.<subdomain>.workers.dev address.');
  const base = url.replace(/\/$/, '');
  const c = readConfig();
  for (const path of ['/', '/api/workspace']) {
    const r = await fetch(base + path, { redirect: 'manual' });
    const location = r.headers.get('location') ?? '';
    const body = r.status === 200 ? await r.text() : '';
    const behindAccess = [301, 302, 303, 307].includes(r.status) && /\.cloudflareaccess\.com\//.test(location);
    // Before Access is configured the page shows only "Sign-in required" and every API call is refused.
    const failClosed = !c.accessAud && (path === '/' ? r.status === 200 && body.includes('Sign-in required') && !body.includes('Care workspace') : r.status === 503);
    console.log(`${path}: ${r.status}${location ? ` -> ${new URL(location).host}` : ''}`);
    if (!behindAccess && !failClosed) fail(`${path} answered ${r.status} without sign-in; expected ${c.accessAud ? 'a Cloudflare Access redirect (is Access enabled on the workers.dev address?)' : 'the sign-in-required page or 503 until Access is configured'}.`);
  }
  console.log(c.accessAud ? 'The Worker is behind Cloudflare Access.' : 'Access is not configured yet; the Worker refuses every request with 503.');
}

const [command, arg] = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    if (command === 'database') {
      const c = readConfig();
      let id = findDatabase(c.d1DatabaseName);
      if (!id) { wrangler(['d1', 'create', c.d1DatabaseName, '--location', c.d1LocationHint || 'apac']); id = findDatabase(c.d1DatabaseName); }
      if (!id) fail('the D1 database could not be found after creation.');
      if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `SAHA_D1_DATABASE_ID=${id}\n`);
      console.log(`D1 database ${c.d1DatabaseName}: ${id}`);
    } else if (command === 'configure') {
      const c = readConfig();
      const out = hostedWorkerConfig(JSON.parse(readFileSync(BUILT, 'utf8')), c, process.env.SAHA_D1_DATABASE_ID);
      writeFileSync(BUILT, JSON.stringify(out, null, 2) + '\n');
      console.log(`Configured ${out.name}: environment ${c.environment}, identity cloudflare-access${c.accessAud ? '' : ' (not configured yet: every request gets 503)'}, scheduled job ${c.scheduledCron ? `on cron "${c.scheduledCron}"` : 'off'}.`);
    } else if (command === 'check') {
      await check(arg);
    } else {
      fail('usage: database | configure | check <workers.dev URL>');
    }
  } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
}
