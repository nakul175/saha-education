import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const root = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({ resolve(spec, ctx, next) {
  if (spec === '@/db' || spec === '@/db/index') return { url: 'data:text/javascript,export const getDb = () => globalThis.__sahaTestDb;', shortCircuit: true };
  if (spec === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
  if (spec === 'next/headers') return { url: 'data:text/javascript,export const cookies = async () => globalThis.__sahaCookies;', shortCircuit: true };
  let resolved = spec.startsWith('@/') ? pathToFileURL(join(root, spec.slice(2))).href : spec;
  if ((resolved.startsWith('.') || resolved.startsWith('file:')) && !/\.[cm]?[jt]sx?$/.test(resolved)) {
    for (const extension of ['.ts', '.tsx', '/index.ts']) {
      const url = new URL(resolved + extension, ctx.parentURL);
      if (existsSync(url)) return { url: url.href, shortCircuit: true };
    }
  }
  return next(resolved, ctx);
} });
const { drizzle } = await import('drizzle-orm/sqlite-proxy');
const schema = await import(pathToFileURL(join(root, 'db/schema.ts')).href);
const auth = await import(pathToFileURL(join(root, 'lib/education/auth.ts')).href);
const identity = await import(pathToFileURL(join(root, 'lib/education/identity.ts')).href);
const session = await import(pathToFileURL(join(root, 'lib/education/session.ts')).href);
const oidc = await import(pathToFileURL(join(root, 'lib/education/oidc.ts')).href);
const routes = await import(pathToFileURL(join(root, 'app/api/session/route.ts')).href);
const callbackRoute = await import(pathToFileURL(join(root, 'app/api/auth/callback/route.ts')).href);
const { generateKeyPair, exportJWK, SignJWT } = await import('jose');
const issuer = 'https://identity.example.test';
const origin = 'https://school.example.test';
Object.assign(process.env, { SAHA_OIDC_ISSUER: issuer, SAHA_OIDC_CLIENT_ID: 'education-test',
  SAHA_OIDC_CLIENT_SECRET: 'synthetic-not-a-real-secret', SAHA_OIDC_REDIRECT_URL: `${origin}/api/auth/callback`,
  SAHA_ALLOWED_ORIGINS: origin });
let sqlite;
function reset() {
  sqlite?.close();
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort()) {
    sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  globalThis.__sahaTestDb = drizzle(async (sql, params, method) => {
    const statement = sqlite.prepare(sql);
    if (method === 'run') { statement.run(...params); return { rows: [] }; }
    if (method === 'get') { const row = statement.get(...params); return { rows: row ? Object.values(row) : undefined }; }
    return { rows: statement.all(...params).map(row => Object.values(row)) };
  }, { schema });
  sqlite.prepare('INSERT INTO schools(id,name,created_at,updated_at) VALUES (?,?,?,?)').run('school-a', 'Synthetic school', 'now', 'now');
  sqlite.prepare('INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run('user-a', 'Synthetic admin', 'synthetic@example.test', 'admin', 'school-a', issuer, 'subject-a', 'now', 'now');
}
const request = (path, headers = {}, method = 'GET') => new Request(`${origin}${path}`, { method, headers });
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('legacy cookies, forged identity headers and missing sessions never grant access', async () => {
  reset();
  assert.equal(await auth.getPrincipal(), null);
  for (const headers of [{ cookie: 'saha_demo_role=admin' }, { 'x-saha-user': 'user-a', 'x-saha-role': 'admin' }, { cookie: `${session.SESSION_COOKIE}=forged` }]) {
    assert.equal(await auth.getPrincipal(request('/api/session', headers)), null);
  }
  await assert.rejects(auth.requirePrincipal(request('/api/session')), /Authentication required/);
  assert.throws(() => auth.requireRole({ id: 'u', role: 'student' }, 'admin'), /Permission denied/);
});
test('opaque sessions persist only digests and enforce logout, expiration and live account authority', async () => {
  reset();
  const setCookie = await session.createSession('user-a');
  assert.match(setCookie, /HttpOnly; Secure; SameSite=Lax/);
  const rawCookie = setCookie.split(';')[0];
  const token = rawCookie.split('=')[1];
  const row = sqlite.prepare('SELECT * FROM auth_sessions').get();
  assert.notEqual(row.token_hash, token);
  assert.equal(row.token_hash, await identity.digest(token));
  assert.deepEqual(await auth.getPrincipal(request('/api/session', { cookie: rawCookie })), { id: 'user-a', role: 'admin', schoolId: 'school-a' });
  assert.equal(await auth.getPrincipal(request('/api/session', { cookie: `${rawCookie}; ${rawCookie}` })), null);
  sqlite.exec("UPDATE users SET role='teacher'");
  assert.equal((await auth.getPrincipal(request('/api/session', { cookie: rawCookie }))).role, 'teacher');
  sqlite.exec("UPDATE users SET disabled_at='now'");
  assert.equal(await auth.getPrincipal(request('/api/session', { cookie: rawCookie })), null);
  sqlite.exec('UPDATE users SET disabled_at=NULL');
  sqlite.exec('UPDATE auth_sessions SET expires_at=0');
  assert.equal(await auth.getPrincipal(request('/api/session', { cookie: rawCookie })), null);
  const validCookie = (await session.createSession('user-a')).split(';')[0];
  const response = await routes.DELETE(request('/api/session', { origin, cookie: validCookie }, 'DELETE'));
  assert.equal(response.status, 200);
  assert.equal(await auth.getPrincipal(request('/api/session', { cookie: validCookie })), null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('mutations require approved origin and role selection cannot mint a session', async () => {
  reset();
  for (const foreign of [undefined, 'null', 'https://evil.example.test']) {
    const response = await routes.DELETE(request('/api/session', foreign ? { origin: foreign } : {}, 'DELETE'));
    assert.equal(response.status, 403);
  }
  assert.throws(() => auth.requireSameOrigin(request('/', { origin, 'sec-fetch-site': 'cross-site' }, 'POST')), /origin/);
  const response = await routes.POST(request('/api/session', { origin }, 'POST'));
  assert.equal(response.status, 400);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions').get().count, 0);
});
const keys = await generateKeyPair('RS256');
const jwk = await exportJWK(keys.publicKey); jwk.kid = 'test-key'; jwk.alg = 'RS256';
let claims = {};
let tokenNonce;
let exchangedVerifier;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === `${issuer}/.well-known/openid-configuration`) return Response.json({ issuer,
    authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
    id_token_signing_alg_values_supported: ['RS256'], token_endpoint_auth_methods_supported: ['client_secret_basic'] });
  if (target === `${issuer}/jwks`) return Response.json({ keys: [jwk] });
  if (target === `${issuer}/token`) {
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('code_verifier'), exchangedVerifier);
    assert.equal(body.get('redirect_uri'), `${origin}/api/auth/callback`);
    assert.match(options.headers.Authorization, /^Basic /);
    const idToken = await new SignJWT({ nonce: tokenNonce, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(claims.iss ?? issuer).setAudience(claims.aud ?? 'education-test').setSubject(claims.sub ?? 'subject-a')
      .setIssuedAt().setExpirationTime(claims.exp ?? '5m').sign(keys.privateKey);
    return Response.json({ id_token: idToken });
  }
  throw new Error(`Unexpected synthetic fetch: ${target}`);
};
async function begin() {
  claims = {};
  const response = await oidc.startLogin(request('/api/auth/login', { origin }, 'POST'));
  assert.equal(response.status, 200);
  const url = new URL((await response.json()).url);
  const transaction = sqlite.prepare('SELECT * FROM oidc_transactions ORDER BY expires_at DESC LIMIT 1').get();
  tokenNonce = transaction.nonce;
  exchangedVerifier = transaction.verifier;
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), await identity.digest(transaction.verifier));
  assert.equal(transaction.state_hash, await identity.digest(url.searchParams.get('state')));
  const browserCookie = response.headers.get('set-cookie').split(';')[0];
  return { state: url.searchParams.get('state'), browserCookie };
}
const callback = transaction => request(`/api/auth/callback?code=synthetic-code&state=${transaction.state}`, { cookie: transaction.browserCookie });
test('signed OIDC flow binds PKCE, nonce and browser; maps only provisioned issuer+subject; prevents replay', async () => {
  reset();
  const transaction = await begin();
  const response = await oidc.finishLogin(callback(transaction));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/');
  assert.match(response.headers.get('set-cookie'), /__Host-saha_session=/);
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions').get().count, 1);
  await assert.rejects(oidc.finishLogin(callback(transaction)), /transaction/);
});
test('wrong browser, nonce, issuer, audience, expired token and unprovisioned subject fail closed', async () => {
  for (const invalidClaims of [{ nonce: 'wrong' }, { iss: 'https://evil.example.test' }, { aud: 'other-client' }, { exp: 1 }, { sub: 'unknown-subject' }, { azp: 'other-client' }]) {
    reset(); const transaction = await begin(); claims = invalidClaims;
    await assert.rejects(oidc.finishLogin(callback(transaction)));
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions').get().count, 0);
  }
  reset(); const transaction = await begin();
  await assert.rejects(oidc.finishLogin(request(`/api/auth/callback?code=x&state=${transaction.state}`, { cookie: `${oidc.TRANSACTION_COOKIE}=${identity.randomToken()}` })), /transaction/);
  sqlite.exec('UPDATE oidc_transactions SET expires_at=0');
  await assert.rejects(oidc.finishLogin(callback(transaction)), /transaction/);
});
test('provider errors redirect to controlled login failure and rate limits persist in shared database', async () => {
  reset(); const transaction = await begin();
  const response = await callbackRoute.GET(request(`/api/auth/callback?error=access_denied&state=${transaction.state}`, { cookie: transaction.browserCookie }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login?error=signin_failed');
  assert.equal(sqlite.prepare('SELECT count(*) AS count FROM auth_sessions').get().count, 0);
  reset();
  for (let index = 0; index < 20; index++) await oidc.startLogin(request('/api/auth/login', { origin }, 'POST'));
  await assert.rejects(oidc.startLogin(request('/api/auth/login', { origin }, 'POST')), error => error.status === 429);
});
let failed = 0;
try {
  for (const { name, fn } of tests) {
    try { await fn(); console.log(`ok - ${name}`); }
    catch (error) { failed++; console.error(`not ok - ${name}`, error); }
  }
} finally { globalThis.fetch = originalFetch; sqlite?.close(); }
console.log(JSON.stringify({passed: tests.length - failed, failed, skipped: 0}));
if (failed) process.exitCode = 1;
