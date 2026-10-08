// FR-01 trusted sign-in against a LOCAL FAKE OpenID Connect issuer implemented in tests/support/fake-oidc-issuer.mjs.
// The real provider is not configured and stays fail-closed (see "unconfigured" scenarios); this suite proves the
// complete authorization-code + PKCE flow end to end through the real route handlers and production Drizzle SQL over
// isolated SQLite: browser-bound one-use transaction, state/nonce, token validation, issuer+subject mapping, rejection of
// unmapped/disabled users, replay, expiry, provider failure, logout and the interaction with identity administration.
// No network request leaves the process; the fake records and refuses anything outside its own issuer URL.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';
import { CookieJar, FakeOidcIssuer } from '../support/fake-oidc-issuer.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const identity = await load('lib/education/identity.ts');
const session = await load('lib/education/session.ts');
const loginRoute = await load('app/api/auth/login/route.ts');
const callbackRoute = await load('app/api/auth/callback/route.ts');
const sessionRoute = await load('app/api/session/route.ts');
const demoRoute = await load('app/api/demo/route.ts');
const usersRoute = await load('app/api/users/route.ts');
const adminUsers = await load('app/api/admin/users/route.ts');
const adminUser = await load('app/api/admin/users/[id]/route.ts');
const adminIdentity = await load('app/api/admin/users/[id]/identity/route.ts');
const adminRole = await load('app/api/admin/users/[id]/role/route.ts');

const origin = 'https://school.test.invalid';
const fake = await new FakeOidcIssuer({ redirectUri: origin + '/api/auth/callback' }).ready();
const restoreFetch = fake.install();
const settingNames = [
  'SAHA_OIDC_ISSUER',
  'SAHA_OIDC_CLIENT_ID',
  'SAHA_OIDC_CLIENT_SECRET',
  'SAHA_OIDC_REDIRECT_URL',
  'SAHA_OIDC_TOKEN_AUTH_METHOD',
];
function configure(values = fake.settings()) {
  for (const name of settingNames) delete bindings[name];
  Object.assign(bindings, { SAHA_ALLOWED_ORIGINS: origin }, values);
}
let checks = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  checks++;
}
function count(table, where = '1=1') {
  return sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get().n;
}
const now = '2026-10-05T00:00:00.000Z';
const addUser = (id, role, extra = {}) =>
  sqlite
    .prepare(
      `INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,disabled_at,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      'Synthetic ' + id,
      id + '@example.invalid',
      role,
      'school_id' in extra ? extra.school_id : 'a',
      'issuer' in extra ? extra.issuer : fake.issuer,
      'subject' in extra ? extra.subject : 'sub-' + id,
      extra.disabled ?? null,
      now,
      now,
    );
for (const role of ['admin', 'teacher', 'guardian', 'student']) addUser('oidc-' + role, role);
addUser('oidc-disabled', 'teacher', { disabled: now });
addUser('oidc-no-school', 'teacher', { school_id: null });
addUser('oidc-bad-role', 'owner');
addUser('oidc-other-issuer', 'teacher', { issuer: 'https://another-provider.test.invalid' });
let address = 0;
const nextIp = () => '203.0.113.' + (++address % 250) + '-' + Math.floor(address / 250);
const post = (path, browser, extra = {}) =>
  new Request(origin + path, {
    method: 'POST',
    headers: {
      origin,
      'cf-connecting-ip': nextIp(),
      ...(browser?.header() ? { cookie: browser.header() } : {}),
      ...extra,
    },
  });
const cookieHeader = (browser) => (browser.header() ? { cookie: browser.header() } : {});
const failureLocation = '/login?error=signin_failed';

async function start(browser, extra = {}) {
  const response = await loginRoute.POST(post('/api/auth/login', browser, extra));
  browser.apply(response);
  return response;
}
async function authorizeAt(response, subject, options = {}) {
  assert.equal(response.status, 200, 'start must succeed');
  return fake.authorize((await response.json()).url, { subject, ...options });
}
function callback(browser, redirectUrl, extraHeaders = {}) {
  return callbackRoute.GET(
    new Request(redirectUrl, { headers: { ...cookieHeader(browser), ...extraHeaders } }),
  );
}
async function signIn(browser, subject, options = {}) {
  const started = await start(browser);
  const authorized = await authorizeAt(started, subject, options);
  const response = await callback(browser, authorized.redirectUrl);
  browser.apply(response);
  return { started, authorized, response };
}
const rejected = (response) =>
  response.status === 303 && response.headers.get('location') === failureLocation;
async function whoami(browser) {
  const response = await sessionRoute.GET(
    new Request(origin + '/api/session', { headers: cookieHeader(browser) }),
  );
  return { status: response.status, body: await response.json() };
}
const sessions = () => count('auth_sessions');
const digest = identity.digest;

try {
  // ---- Real mode fails closed until a provider is configured ---------------------------------------------------------
  configure({});
  const idle = new CookieJar();
  let response = await start(idle);
  check(
    [response.status, response.headers.get('set-cookie'), (await response.json()).error],
    [503, null, 'Sign-in has not been configured'],
    'Unconfigured provider: controlled 503, no provider redirect and no cookie',
  );
  check(
    [count('oidc_transactions'), sessions(), fake.log.length, fake.external.length],
    [0, 0, 0, 0],
    'Unconfigured provider creates no transaction or session and contacts nothing',
  );
  check(
    await (await loginRoute.GET()).json(),
    { configured: false },
    'Availability reports not configured and no provider detail',
  );
  const brokenSettings = [
    { SAHA_OIDC_ISSUER: fake.issuer },
    { ...fake.settings(), SAHA_OIDC_ISSUER: 'http://issuer.test.invalid' },
    { ...fake.settings(), SAHA_OIDC_REDIRECT_URL: origin + '/elsewhere' },
    { ...fake.settings(), SAHA_OIDC_REDIRECT_URL: 'https://not-allowed.test.invalid/api/auth/callback' },
    { ...fake.settings(), SAHA_OIDC_CLIENT_SECRET: '' },
    { ...fake.settings(), SAHA_OIDC_TOKEN_AUTH_METHOD: 'private_key_jwt' },
    { ...fake.settings(), SAHA_OIDC_ISSUER: fake.issuer + '?tenant=x' },
    { ...fake.settings(), SAHA_OIDC_ISSUER: 'https://user:pass@issuer.test.invalid' },
    { ...fake.settings(), SAHA_OIDC_REDIRECT_URL: origin + '/api/auth/callback?x=1' },
  ];
  for (const values of brokenSettings) {
    configure(values);
    response = await start(idle);
    check(
      [response.status, response.headers.get('set-cookie'), fake.log.length],
      [503, null, 0],
      'Incomplete or unsafe provider settings fail closed before any provider contact: ' +
        JSON.stringify(values).slice(0, 60),
    );
    check(
      (await loginRoute.GET()).status === 200 && (await (await loginRoute.GET()).json()).configured,
      false,
      'Availability stays false for unsafe settings',
    );
  }
  configure({});
  const demoWhileClosed = await demoRoute.POST(
    post('/api/demo', null, { 'content-type': 'application/json' }),
  );
  check(demoWhileClosed.status, 404, 'Unconfigured real mode never falls back to demo sign-in');
  check(
    await (await demoRoute.GET()).json(),
    { available: false, synthetic: true },
    'Demo stays off by default',
  );

  // ---- Complete flow, client_secret_basic ----------------------------------------------------------------------------------
  configure();
  check(
    await (await loginRoute.GET()).json(),
    { configured: true },
    'Availability reports configured once complete',
  );
  const browser = new CookieJar();
  const started = await start(browser);
  check(started.headers.get('cache-control'), 'no-store', 'Start response is uncached');
  check(started.headers.get('referrer-policy'), 'no-referrer', 'Start response sends no referrer');
  const transactionCookie = started.headers.get('set-cookie');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=300'])
    check(transactionCookie.includes(attribute), true, 'Transaction cookie attribute ' + attribute);
  check(
    /^__Host-saha_oidc=[A-Za-z0-9_-]{43};/.test(transactionCookie) && !/Domain=/i.test(transactionCookie),
    true,
    'Transaction cookie is an opaque host-only value',
  );
  const authorized = await authorizeAt(started, 'sub-oidc-admin');
  check(
    {
      response_type: authorized.query.response_type,
      scope: authorized.query.scope,
      client_id: authorized.query.client_id,
      redirect_uri: authorized.query.redirect_uri,
      method: authorized.query.code_challenge_method,
    },
    {
      response_type: 'code',
      scope: 'openid',
      client_id: fake.clientId,
      redirect_uri: fake.redirectUri,
      method: 'S256',
    },
    'Authorization request is a PKCE code request for the registered client and exact redirect',
  );
  check(
    authorized.query.state !== authorized.query.nonce && /^[A-Za-z0-9_-]{43}$/.test(authorized.query.state),
    true,
    'State and nonce are distinct 256-bit values',
  );
  const transaction = sqlite.prepare('SELECT * FROM oidc_transactions').get();
  check(
    [
      transaction.state_hash === (await digest(authorized.query.state)),
      transaction.state_hash !== authorized.query.state,
      transaction.browser_hash === (await digest(browser.get('__Host-saha_oidc'))),
      transaction.browser_hash !== browser.get('__Host-saha_oidc'),
    ],
    [true, true, true, true],
    'Only digests of state and browser binding are stored',
  );
  check(
    [
      transaction.nonce === authorized.query.nonce,
      authorized.query.code_challenge === (await digest(transaction.verifier)),
      transaction.verifier !== authorized.query.code_challenge,
    ],
    [true, true, true],
    'Nonce and PKCE verifier are bound to this transaction',
  );
  check(
    transaction.expires_at - Date.now() <= 300000 && transaction.expires_at - Date.now() > 290000,
    true,
    'Transaction lives five minutes',
  );
  const before = sessions();
  response = await callback(browser, authorized.redirectUrl);
  browser.apply(response);
  check(
    [
      response.status,
      response.headers.get('location'),
      response.headers.get('cache-control'),
      response.headers.get('referrer-policy'),
    ],
    [303, '/', 'no-store', 'no-referrer'],
    'Callback redirects to the application without caching or referrer',
  );
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('__Host-saha_session='));
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
    check(sessionCookie.includes(attribute), true, 'Session cookie attribute ' + attribute);
  check(
    /^__Host-saha_session=[A-Za-z0-9_-]{43};/.test(sessionCookie),
    true,
    'Fresh opaque session cookie is issued',
  );
  check(
    [sessions(), count('oidc_transactions')],
    [before + 1, 0],
    'One session is created and the transaction is consumed',
  );
  check(browser.get('__Host-saha_oidc'), undefined, 'The browser binding cookie is cleared');
  check(
    await whoami(browser),
    { status: 200, body: { id: 'oidc-admin', role: 'admin', schoolId: 'a' } },
    'The mapped provisioned account is signed in with its own role and school',
  );
  check(
    (await usersRoute.GET(new Request(origin + '/api/users', { headers: cookieHeader(browser) }))).status,
    200,
    'The new session works on a protected API',
  );
  const tokenCall = fake.log.find((entry) => entry.kind === 'token');
  check(
    [
      tokenCall.auth,
      tokenCall.grant,
      tokenCall.redirectUri,
      tokenCall.ok,
      tokenCall.verifier === transaction.verifier,
    ],
    ['basic', 'authorization_code', fake.redirectUri, true, true],
    'Code exchange uses basic client authentication, the configured redirect and the stored PKCE verifier',
  );
  check(
    fake.log.map((entry) => entry.kind),
    ['discovery', 'authorize', 'discovery', 'token', 'jwks'],
    'Provider traffic is exactly discovery, authorize, discovery, token exchange and key fetch',
  );
  check(
    fake.log.some((entry) => entry.kind === 'unsafe-redirect-policy'),
    false,
    'Discovery and token requests refuse redirects',
  );

  // Replay of the very same callback and cookie cannot create another session.
  const used = sessions();
  const second = await callback(
    { header: () => `__Host-saha_oidc=${'A'.repeat(43)}` },
    authorized.redirectUrl,
  );
  check(
    [rejected(second), sessions()],
    [true, used],
    'A replayed callback with the wrong browser binding is rejected without a session',
  );
  const stale = await callback(new CookieJar(), authorized.redirectUrl);
  check(
    [rejected(stale), sessions()],
    [true, used],
    'A replayed callback without any binding cookie is rejected',
  );
  check(
    stale.headers
      .getSetCookie()
      .some((value) => value.startsWith('__Host-saha_oidc=;') && value.includes('Max-Age=0')),
    true,
    'Failure clears the transaction cookie',
  );
  check((await stale.text()).length, 0, 'Failure redirect carries no body, token, code or provider detail');
  check(
    stale.headers.get('location').includes('code') || stale.headers.get('location').includes('token'),
    false,
    'Failure location carries no provider data',
  );

  // ---- Same transaction twice with the correct browser: one-use ------------------------------------------------------------
  {
    const twice = new CookieJar();
    const first = await start(twice);
    const authz = await authorizeAt(first, 'sub-oidc-teacher');
    const copy = new CookieJar();
    copy.set('__Host-saha_oidc', twice.get('__Host-saha_oidc'));
    const win = await callback(twice, authz.redirectUrl);
    twice.apply(win);
    const total = sessions();
    const lose = await callback(copy, authz.redirectUrl);
    check(
      [win.headers.get('location'), rejected(lose), sessions()],
      ['/', true, total],
      'A second use of one transaction fails even with the genuine browser cookie',
    );
    check(
      fake.log.filter((entry) => entry.kind === 'token').length,
      2,
      'Only two token exchanges happened so far (the replay never reached the issuer)',
    );
  }

  // ---- Wrong browser cannot consume the legitimate transaction ----------------------------------------------------------
  {
    const victim = new CookieJar(),
      attacker = new CookieJar();
    const first = await start(victim);
    const authz = await authorizeAt(first, 'sub-oidc-student');
    const otherStart = await start(attacker);
    const tokenCalls = fake.count('token');
    const attack = await callback(attacker, authz.redirectUrl);
    check(
      [rejected(attack), count('oidc_transactions'), fake.count('token')],
      [true, 2, tokenCalls],
      'Another browser cannot consume the legitimate transaction or reach the token endpoint',
    );
    const completed = await callback(victim, authz.redirectUrl);
    victim.apply(completed);
    check(
      [completed.headers.get('location'), (await whoami(victim)).body.id],
      ['/', 'oidc-student'],
      'The legitimate browser still completes afterwards',
    );
    sqlite.prepare('DELETE FROM oidc_transactions').run();
    void otherStart;
  }

  // ---- State, query and expiry ----------------------------------------------------------------------------------------------
  {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-teacher');
    const calls = fake.count('token');
    const total = sessions();
    const bad = [
      authz.redirectUrl.replace(/state=[^&]+/, 'state=' + 'B'.repeat(43)),
      authz.redirectUrl.replace(/state=[^&]+/, 'state=short'),
      authz.redirectUrl.replace(/[?&]state=[^&]+/, ''),
      authz.redirectUrl + '&state=' + authz.query.state,
      authz.redirectUrl + '&code=another-code',
    ];
    for (const url of bad)
      check(
        rejected(await callback(jar, url)),
        true,
        'Forged, malformed, duplicated or missing state/code parameters are rejected: ' + url.slice(-30),
      );
    check(
      [fake.count('token'), sessions()],
      [calls, total],
      'Rejected callbacks reached no token endpoint and created no session',
    );
    check(count('oidc_transactions'), 1, 'A request that does not match the transaction does not consume it');
    sqlite.prepare('UPDATE oidc_transactions SET expires_at = ?').run(Date.now() - 1);
    check(
      [rejected(await callback(jar, authz.redirectUrl)), fake.count('token')],
      [true, calls],
      'An expired transaction is rejected before any provider request',
    );
    check(
      rejected(await callback(jar, authz.redirectUrl)),
      true,
      'The expired transaction stays unusable on every retry',
    );
    const expiredHash = sqlite.prepare('SELECT state_hash FROM oidc_transactions').get().state_hash;
    await start(new CookieJar());
    check(
      [count('oidc_transactions'), count('oidc_transactions', `state_hash='${expiredHash}'`)],
      [1, 0],
      'Starting a new login cleans the expired transaction and keeps only the new one',
    );
    sqlite.prepare('DELETE FROM oidc_transactions').run();
  }
  for (const [label, mutate] of [
    ['missing code', (url) => url.replace(/[?&]code=[^&]+/, '')],
    ['oversized code', (url) => url.replace(/code=[^&]+/, 'code=' + 'x'.repeat(4100))],
  ]) {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-teacher');
    const calls = fake.count('token');
    const total = sessions();
    check(
      [
        rejected(await callback(jar, mutate(authz.redirectUrl))),
        fake.count('token'),
        sessions(),
        count('oidc_transactions'),
      ],
      [true, calls, total, 0],
      'A callback with a ' + label + ' consumes its one-use transaction and reaches no token endpoint',
    );
    check(
      rejected(await callback(jar, authz.redirectUrl)),
      true,
      'The consumed transaction cannot be reused after a ' + label,
    );
  }

  // ---- Provider error responses and failures ------------------------------------------------------------------------------
  {
    const jar = new CookieJar();
    const first = await start(jar);
    const denied = await authorizeAt(first, 'sub-oidc-admin', { deny: true });
    const total = sessions();
    const calls = fake.count('token');
    const result = await callback(jar, denied.redirectUrl);
    check(
      [rejected(result), sessions(), fake.count('token'), count('oidc_transactions')],
      [true, total, calls, 0],
      'access_denied from the provider creates no session and no token request',
    );
    check(
      (await demoRoute.POST(post('/api/demo', null, { 'content-type': 'application/json' }))).status,
      404,
      'Demo sign-in remains closed while a provider is configured',
    );
  }
  for (const [mode, label] of [
    ['timeout', 'token request timeout'],
    ['error', 'token endpoint 500'],
    ['html', 'non-JSON token response'],
    ['huge', 'oversized token response'],
    ['no_token', 'missing id_token'],
    ['numeric_token', 'non-string id_token'],
  ]) {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-admin');
    fake.tokenMode = mode;
    const total = sessions();
    const result = await callback(jar, authz.redirectUrl);
    check(
      [rejected(result), sessions(), (await result.text()).length],
      [true, total, 0],
      'Provider failure is controlled and creates no session: ' + label,
    );
    fake.tokenMode = null;
  }
  for (const [mode, label] of [
    ['timeout', 'discovery timeout'],
    ['error', 'discovery unavailable'],
  ]) {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-admin');
    fake.discoveryMode = mode;
    const total = sessions();
    const result = await callback(jar, authz.redirectUrl);
    check(
      [rejected(result), sessions()],
      [true, total],
      'Provider failure at callback is controlled and creates no session: ' + label,
    );
    const refused = await start(new CookieJar());
    const refusal = await refused.json();
    check(
      [
        refused.status,
        refused.headers.get('set-cookie'),
        ['Sign-in unavailable', 'Identity service unavailable'].includes(refusal.error),
        JSON.stringify(refusal).includes(fake.issuer),
      ],
      [503, null, true, false],
      'Provider failure at start returns a controlled 503 without leaking detail: ' + label,
    );
    fake.discoveryMode = null;
  }
  {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-admin');
    fake.jwksMode = 'timeout';
    const total = sessions();
    check(
      [rejected(await callback(jar, authz.redirectUrl)), sessions()],
      [true, total],
      'A key-set timeout creates no session',
    );
    fake.jwksMode = null;
  }
  {
    fake.metadataIssuer = 'https://spoofed.test.invalid';
    const refused = await start(new CookieJar());
    check(refused.status, 503, 'Discovery whose issuer differs from the configured issuer is refused');
    fake.metadataIssuer = fake.issuer;
    fake.algorithms = ['none', 'HS256'];
    check(
      (await start(new CookieJar())).status,
      503,
      'A provider offering only unsupported signing algorithms is refused',
    );
    fake.algorithms = ['RS256'];
  }
  {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-admin');
    const total = sessions();
    fake.codes.get(authz.code).used = true; // the issuer already redeemed this code (authorization-code replay)
    check(
      [rejected(await callback(jar, authz.redirectUrl)), sessions(), fake.log.at(-1).replay],
      [true, total, true],
      'An already redeemed authorization code is refused by the issuer and creates no session',
    );
  }

  // ---- Token validation matrix -------------------------------------------------------------------------------------------------
  const nowSeconds = Math.floor(Date.now() / 1000);
  const invalidTokens = [
    ['wrong issuer', { iss: 'https://evil.test.invalid' }],
    ['wrong audience', { aud: 'another-client' }],
    ['audience list without azp', { aud: [fake.clientId, 'another-client'] }],
    ['authorized party for another client', { azp: 'another-client' }],
    ['expired token', { exp: nowSeconds - 3600 }],
    ['token issued in the future', { iat: nowSeconds + 3600, exp: nowSeconds + 7200 }],
    ['missing exp', { exp: undefined }],
    ['missing iat', { iat: undefined }],
    ['missing sub', { sub: undefined }],
    ['missing nonce', { nonce: undefined }],
    ['missing iss', { iss: undefined }],
    ['missing aud', { aud: undefined }],
    ['wrong nonce', { nonce: 'N'.repeat(43) }],
    ['empty subject', { sub: '' }],
    ['numeric subject', { sub: 12345 }],
    ['over-long subject', { sub: 'x'.repeat(256) }],
  ];
  for (const [label, override] of invalidTokens) {
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-admin');
    fake.tokenOverrides = override;
    const total = sessions();
    const result = await callback(jar, authz.redirectUrl);
    check(
      [rejected(result), sessions(), count('users')],
      [true, total, count('users')],
      'Invalid token claim is rejected even with a valid signature: ' + label,
    );
    fake.tokenOverrides = {};
  }
  {
    // A token signed with a different key, with a symmetric algorithm, or unsigned must never be accepted.
    const { generateKeyPair } = await import('jose');
    const stranger = await generateKeyPair('RS256');
    const cases = [
      ['unknown signing key', { alg: 'RS256', key: stranger.privateKey, kid: fake.kid }],
      ['unknown key id', { alg: 'RS256', key: fake.keys.privateKey, kid: 'not-published' }],
      [
        'symmetric algorithm confusion',
        { alg: 'HS256', key: new TextEncoder().encode(JSON.stringify(fake.jwk)), kid: fake.kid },
      ],
    ];
    for (const [label, signer] of cases) {
      const jar = new CookieJar();
      const first = await start(jar);
      const authz = await authorizeAt(first, 'sub-oidc-admin');
      fake.signWith = signer;
      const total = sessions();
      check(
        [rejected(await callback(jar, authz.redirectUrl)), sessions()],
        [true, total],
        'Token with an unacceptable signature is rejected: ' + label,
      );
      fake.signWith = null;
    }
    const algJar = new CookieJar();
    const algStart = await start(algJar);
    const algAuthz = await authorizeAt(algStart, 'sub-oidc-admin');
    fake.algorithms = ['ES256'];
    const algTotal = sessions();
    check(
      [rejected(await callback(algJar, algAuthz.redirectUrl)), sessions()],
      [true, algTotal],
      'A token signed with an algorithm the provider did not advertise is rejected even with a published key',
    );
    fake.algorithms = ['RS256'];
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-admin');
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const unsigned = `${header}.${Buffer.from(JSON.stringify({ iss: fake.issuer, aud: fake.clientId, sub: 'sub-oidc-admin', nonce: authz.query.nonce, iat: nowSeconds, exp: nowSeconds + 300 })).toString('base64url')}.`;
    const original = fake.sign.bind(fake);
    fake.sign = async () => unsigned;
    const total = sessions();
    check(
      [rejected(await callback(jar, authz.redirectUrl)), sessions()],
      [true, total],
      'An unsigned token (alg none) is rejected',
    );
    fake.sign = original;
  }
  {
    // Token claims that are acceptable: multiple audiences with the matching authorised party, and an email claim that is ignored.
    const jar = new CookieJar();
    const first = await start(jar);
    const authz = await authorizeAt(first, 'sub-oidc-teacher', {
      claims: {
        aud: [fake.clientId, 'another-client'],
        azp: fake.clientId,
        email: 'someone-else@example.invalid',
      },
    });
    const result = await callback(jar, authz.redirectUrl);
    jar.apply(result);
    check(
      [result.headers.get('location'), (await whoami(jar)).body.id],
      ['/', 'oidc-teacher'],
      'A valid multi-audience token with the matching authorised party maps by issuer and subject, ignoring token email',
    );
  }

  // ---- Mapping: only a provisioned, enabled issuer+subject enters a school --------------------------------------------------
  const refusals = [
    [
      'unknown subject with the administrator email claim',
      'unknown-subject',
      { email: 'oidc-admin@example.invalid', email_verified: true },
    ],
    ['subject provisioned under another issuer', 'sub-oidc-other-issuer', {}],
    ['disabled account', 'sub-oidc-disabled', {}],
    ['account without a school', 'sub-oidc-no-school', {}],
    ['account with an unsupported role', 'sub-oidc-bad-role', {}],
    ['case-changed subject', 'SUB-OIDC-ADMIN', {}],
    ['subject with surrounding space', ' sub-oidc-admin', {}],
  ];
  for (const [label, subject, claims] of refusals) {
    const jar = new CookieJar();
    const usersBefore = count('users');
    const total = sessions();
    const { response: result } = await signIn(jar, subject, { claims });
    check(
      [rejected(result), sessions(), count('users'), (await whoami(jar)).status],
      [true, total, usersBefore, 401],
      'Not provisioned for this school: ' + label,
    );
  }
  check(
    { ...sqlite.prepare("SELECT role, school_id FROM users WHERE id='oidc-admin'").get() },
    { role: 'admin', school_id: 'a' },
    'An email match never changes an existing account role or school',
  );

  // ---- Sign-in replaces the previous session and logout revokes ---------------------------------------------------------------
  {
    const jar = new CookieJar();
    await signIn(jar, 'sub-oidc-teacher');
    const oldToken = jar.get('__Host-saha_session');
    check((await whoami(jar)).body.id, 'oidc-teacher', 'First account signs in');
    await signIn(jar, 'sub-oidc-guardian');
    check(
      [(await whoami(jar)).body.id, await session.principalForToken(oldToken)],
      ['oidc-guardian', null],
      'Signing in as another account revokes the earlier session of this browser',
    );
    const crossSite = await sessionRoute.DELETE(
      new Request(origin + '/api/session', {
        method: 'DELETE',
        headers: { origin: 'https://attacker.test.invalid', ...cookieHeader(jar) },
      }),
    );
    check(
      [crossSite.status, (await whoami(jar)).status],
      [403, 200],
      'A cross-origin sign-out is refused and leaves the session',
    );
    const former = jar.header();
    const out = await sessionRoute.DELETE(
      new Request(origin + '/api/session', { method: 'DELETE', headers: { origin, ...cookieHeader(jar) } }),
    );
    jar.apply(out);
    check(
      [
        out.status,
        out.headers.get('cache-control'),
        (await out.json()).message,
        jar.get('__Host-saha_session'),
      ],
      [200, 'no-store', 'Logged out', undefined],
      'Sign-out acknowledges and clears the cookie',
    );
    const replay = await sessionRoute.GET(
      new Request(origin + '/api/session', { headers: { cookie: former } }),
    );
    check(replay.status, 401, 'The former cookie has no authority after sign-out');
    check(
      (await usersRoute.GET(new Request(origin + '/api/users', { headers: { cookie: former } }))).status,
      401,
      'The former cookie cannot reach protected APIs',
    );
  }

  // ---- client authentication methods ---------------------------------------------------------------------------------------------
  for (const method of ['client_secret_post', 'none']) {
    fake.authMethod = method;
    configure(fake.settings());
    const jar = new CookieJar();
    const { response: result } = await signIn(jar, 'sub-oidc-student');
    check(
      [
        result.headers.get('location'),
        (await whoami(jar)).body.id,
        fake.log.filter((entry) => entry.kind === 'token').at(-1).auth,
      ],
      ['/', 'oidc-student', method === 'none' ? 'public' : 'post'],
      'End-to-end sign-in with ' + method,
    );
  }
  fake.authMethod = 'client_secret_basic';
  configure();
  {
    // The provider rejects a client that authenticates incorrectly.
    configure({ ...fake.settings(), SAHA_OIDC_CLIENT_SECRET: 'wrong-secret-value' });
    const jar = new CookieJar();
    const { response: result } = await signIn(jar, 'sub-oidc-student');
    check(
      [rejected(result), (await whoami(jar)).status],
      [true, 401],
      'A wrong client secret cannot obtain tokens',
    );
    configure();
  }

  // ---- Identity administration drives sign-in end to end -------------------------------------------------------------------------
  {
    const adminJar = new CookieJar();
    await signIn(adminJar, 'sub-oidc-admin');
    const act = (method, path, value, handlerContext) => {
      const request = new Request(origin + path, {
        method,
        headers: { origin, 'content-type': 'application/json', ...cookieHeader(adminJar) },
        body: JSON.stringify(value),
      });
      return handlerContext ? handlerContext(request) : request;
    };
    const uuid = () => crypto.randomUUID();
    const why = 'Reviewed synthetic school roster entry';
    const provisioned = await (
      await adminUsers.POST(
        act('POST', '/api/admin/users', {
          clientRequestId: uuid(),
          name: 'Provisioned Teacher',
          email: 'provisioned@example.invalid',
          role: 'teacher',
          identityIssuer: fake.issuer,
          identitySubject: 'provisioned-subject',
          reviewConfirmed: true,
          reason: why,
        }),
      )
    ).json();
    const userId = provisioned.user.id;
    const emailOnly = await signIn(new CookieJar(), 'someone-with-the-same-email', {
      claims: { email: 'provisioned@example.invalid' },
    });
    check(
      rejected(emailOnly.response),
      true,
      'Provisioning does not let a different subject with the same email sign in',
    );
    let jar = new CookieJar();
    let outcome = await signIn(jar, 'provisioned-subject');
    check(
      [outcome.response.headers.get('location'), (await whoami(jar)).body],
      ['/', { id: userId, role: 'teacher', schoolId: 'a' }],
      'A newly provisioned account signs in through the issuer',
    );
    const context = { params: Promise.resolve({ id: userId }) };
    const version = async () =>
      (await (await adminUser.GET(act('GET', '/api/admin/users/' + userId), context)).json()).user.version;
    // role change revokes the session and the next sign-in carries the new role
    let result = await adminRole.PATCH(
      act('PATCH', `/api/admin/users/${userId}/role`, {
        clientRequestId: uuid(),
        expectedVersion: await version(),
        role: 'student',
        reviewConfirmed: true,
        reason: why,
      }),
      context,
    );
    check(result.status, 200, 'Administrator reassigns the role');
    check((await whoami(jar)).status, 401, 'The role change revoked the existing session');
    jar = new CookieJar();
    await signIn(jar, 'provisioned-subject');
    check((await whoami(jar)).body.role, 'student', 'The next sign-in carries the reviewed role');
    // unlink: the identity no longer enters the school
    result = await adminIdentity.PATCH(
      act('PATCH', `/api/admin/users/${userId}/identity`, {
        clientRequestId: uuid(),
        expectedVersion: await version(),
        action: 'unlink',
        reviewConfirmed: true,
        reason: why,
      }),
      context,
    );
    check(
      [result.status, (await whoami(jar)).status],
      [200, 401],
      'Unlinking the identity signs the account out',
    );
    outcome = await signIn(new CookieJar(), 'provisioned-subject');
    check(rejected(outcome.response), true, 'An unlinked identity cannot sign in');
    // link a different subject
    result = await adminIdentity.PATCH(
      act('PATCH', `/api/admin/users/${userId}/identity`, {
        clientRequestId: uuid(),
        expectedVersion: await version(),
        action: 'link',
        identityIssuer: fake.issuer,
        identitySubject: 'replacement-subject',
        reviewConfirmed: true,
        reason: why,
      }),
      context,
    );
    check(result.status, 200, 'Administrator links a replacement identity');
    check(
      rejected((await signIn(new CookieJar(), 'provisioned-subject')).response),
      true,
      'The previous subject remains refused',
    );
    jar = new CookieJar();
    outcome = await signIn(jar, 'replacement-subject');
    check(
      [outcome.response.headers.get('location'), (await whoami(jar)).body.id],
      ['/', userId],
      'The replacement identity signs in',
    );
    // disable: sign-in refused and the session is gone; enable: a new sign-in is required
    result = await adminUser.PATCH(
      act('PATCH', '/api/admin/users/' + userId, {
        clientRequestId: uuid(),
        expectedVersion: await version(),
        enabled: false,
        reviewConfirmed: true,
        reason: why,
      }),
      context,
    );
    check([result.status, (await whoami(jar)).status], [200, 401], 'Disabling the account signs it out');
    check(
      rejected((await signIn(new CookieJar(), 'replacement-subject')).response),
      true,
      'A disabled account cannot sign in',
    );
    result = await adminUser.PATCH(
      act('PATCH', '/api/admin/users/' + userId, {
        clientRequestId: uuid(),
        expectedVersion: await version(),
        enabled: true,
        reviewConfirmed: true,
        reason: why,
      }),
      context,
    );
    check(
      [result.status, (await whoami(jar)).status],
      [200, 401],
      'Enabling does not revive the old session',
    );
    jar = new CookieJar();
    outcome = await signIn(jar, 'replacement-subject');
    check(
      [outcome.response.headers.get('location'), (await whoami(jar)).body.id],
      ['/', userId],
      'A fresh sign-in works after enabling',
    );
    check(
      count('identity_admin_changes', `user_id='${userId}'`),
      3,
      'Every identity decision left immutable evidence',
    );
  }

  // ---- Shared login rate limit ------------------------------------------------------------------------------------------------------------
  {
    const limited = '198.51.100.7';
    const calls = fake.count('discovery');
    const statuses = [];
    for (let attempt = 0; attempt < 21; attempt++)
      statuses.push(
        (
          await loginRoute.POST(
            new Request(origin + '/api/auth/login', {
              method: 'POST',
              headers: { origin, 'cf-connecting-ip': limited },
            }),
          )
        ).status,
      );
    check(
      [statuses.slice(0, 20).every((status) => status === 200), statuses[20]],
      [true, 429],
      'The twenty-first start in a window is refused with 429',
    );
    check(fake.count('discovery') - calls, 20, 'The refused request reached no provider');
    check(
      count('auth_rate_limits', "bucket LIKE 'login:%'") >= 1,
      true,
      'The counter lives in the shared database',
    );
    const other = await loginRoute.POST(
      new Request(origin + '/api/auth/login', {
        method: 'POST',
        headers: { origin, 'cf-connecting-ip': '198.51.100.8' },
      }),
    );
    check(other.status, 200, 'Another edge address has its own bucket');
    const foreign = await loginRoute.POST(
      new Request(origin + '/api/auth/login', {
        method: 'POST',
        headers: { origin: 'https://attacker.test.invalid', 'cf-connecting-ip': '198.51.100.9' },
      }),
    );
    check(
      [foreign.status, foreign.headers.get('set-cookie')],
      [403, null],
      'A login start from a foreign origin is refused with no cookie',
    );
  }

  // ---- Synthetic demo stays closed while a provider is configured ---------------------------------------------------------------------------
  bindings.SAHA_DEMO_ENABLED = 'true';
  bindings.SAHA_DEMO_INSTALLATION_ID = '12345678-1234-4234-8234-123456789abc';
  check(
    [
      await (await demoRoute.GET()).json(),
      (await demoRoute.POST(post('/api/demo', null, { 'content-type': 'application/json' }))).status,
    ],
    [{ available: false, synthetic: true }, 404],
    'Any provider setting closes synthetic entry even when it is switched on',
  );
  delete bindings.SAHA_DEMO_ENABLED;
  delete bindings.SAHA_DEMO_INSTALLATION_ID;

  check(
    [fake.external.length, fake.log.filter((entry) => entry.kind === 'unexpected').length],
    [0, 0],
    'No request left the local issuer: zero external requests',
  );
  console.log(
    `Local fake OIDC issuer: ${checks} checks passed (authorization code + PKCE through real route handlers and production SQL over isolated SQLite; no network; real provider unconfigured).`,
  );
  console.log(
    JSON.stringify({
      passed: checks,
      failed: 0,
      skipped: 0,
      providerRequests: fake.log.length,
      externalRequests: fake.external.length,
    }),
  );
} finally {
  restoreFetch();
  sqlite.close();
}
