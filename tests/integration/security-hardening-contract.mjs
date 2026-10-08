// NFR-01 security hardening review (designed cases TC-011, TC-012, TC-019, TC-020, TC-084; SECURITY-NONFUNCTIONAL-TESTS.md
// "Mandatory boundaries"). Browser security headers, cookie flags, body/input limits, hostile text, error and log
// leakage, session lifecycle, rate limiting and secret-comparison hygiene, against the real handlers with synthetic data.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildFixture } from '../support/authorization-fixture.mjs';
import { dispatch, origin } from '../support/route-dispatch.mjs';
import { bindings, load, root } from '../support/security-db.mjs';

let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
const equal = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};
let externalRequests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  externalRequests++;
  throw new Error('Offline');
};

// ---------------------------------------------------------------------------------------------------------------
// Browser security headers (pure function used by worker/index.ts).
// ---------------------------------------------------------------------------------------------------------------
const headersModule = await load('lib/education/security-headers.ts');
{
  const secured = headersModule.withSecurityHeaders(
    new Request('https://education.example.invalid/dashboard'),
    new Response('<html></html>', {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=600',
        'Set-Cookie': 'a=1; Path=/',
      },
    }),
  );
  const csp = secured.headers.get('content-security-policy');
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "connect-src 'self'",
  ]) {
    check(csp.split('; ').includes(directive), `CSP carries "${directive}"`);
  }
  check(!/https?:\/\//.test(csp) && !/\*/.test(csp), 'CSP names no external origin and no wildcard source');
  check(
    !/script-src[^;]*(https?:|\*|data:)/.test(csp),
    'script-src admits no external, wildcard or data: source',
  );
  equal(secured.headers.get('x-content-type-options'), 'nosniff', 'nosniff');
  equal(secured.headers.get('x-frame-options'), 'DENY', 'legacy frame protection');
  equal(secured.headers.get('referrer-policy'), 'no-referrer', 'referrer policy');
  check(
    /camera=\(\)/.test(secured.headers.get('permissions-policy')) &&
      /microphone=\(\)/.test(secured.headers.get('permissions-policy')),
    'powerful features disabled',
  );
  equal(secured.headers.get('cross-origin-opener-policy'), 'same-origin', 'COOP');
  equal(secured.headers.get('cross-origin-resource-policy'), 'same-origin', 'CORP');
  check(/max-age=\d{7,}/.test(secured.headers.get('strict-transport-security')), 'HSTS over https');
  equal(
    secured.headers.get('cache-control'),
    'no-store',
    'private dynamic HTML is forced to no-store even if the framework said public',
  );
  equal(secured.headers.get('set-cookie'), 'a=1; Path=/', 'existing Set-Cookie preserved');
  equal(await secured.text(), '<html></html>', 'body preserved');
  const local = headersModule.withSecurityHeaders(new Request('http://127.0.0.1:8809/'), new Response('x'));
  equal(local.headers.get('strict-transport-security'), null, 'no HSTS on a plain-http local origin');
  const asset = headersModule.withSecurityHeaders(
    new Request('https://education.example.invalid/_next/static/chunks/a.js'),
    new Response('x', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }),
  );
  equal(
    asset.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
    'immutable hashed assets keep their cache policy',
  );
  check(asset.headers.get('x-content-type-options') === 'nosniff', 'assets still carry nosniff');
  const redirect = headersModule.withSecurityHeaders(
    new Request('https://education.example.invalid/'),
    Response.redirect('https://education.example.invalid/login', 307),
  );
  equal(
    [redirect.status, redirect.headers.get('location')],
    [307, 'https://education.example.invalid/login'],
    'redirects keep status and location',
  );
  const noBody = headersModule.withSecurityHeaders(
    new Request('https://education.example.invalid/api/x'),
    new Response(null, { status: 204 }),
  );
  equal(noBody.status, 204, 'null-body statuses survive');
  const json = headersModule.withSecurityHeaders(
    new Request('https://education.example.invalid/api/x'),
    Response.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } }),
  );
  equal(
    [json.status, await json.json(), json.headers.get('content-type')],
    [201, { ok: true }, 'application/json'],
    'JSON status/body/content-type survive',
  );
}
{
  const entry = readFileSync(join(root, 'worker/index.ts'), 'utf8');
  check(
    /withSecurityHeaders\(request,\s*await handler\.fetch\(request, env, ctx\)\)/.test(entry),
    'worker entry wraps every handler.fetch response in the security headers',
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Static hygiene of the server source.
// ---------------------------------------------------------------------------------------------------------------
function listFiles(directory, extensions) {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const relative = join(directory, name);
    if (statSync(join(root, relative)).isDirectory())
      return name === 'ui' ? [] : listFiles(relative, extensions);
    return extensions.some((extension) => name.endsWith(extension)) ? [relative] : [];
  });
}
const serverSources = [
  ...listFiles('app', ['.ts', '.tsx']),
  ...listFiles('lib', ['.ts', '.tsx']),
  ...listFiles('worker', ['.ts']),
  ...listFiles('db', ['.ts']),
];
{
  const withConsole = serverSources.filter((file) =>
    /\bconsole\.(log|info|warn|error|debug|trace)\b/.test(readFileSync(join(root, file), 'utf8')),
  );
  equal(
    withConsole,
    [],
    'No server or page source writes to the console, so no log can carry a secret or learner data (TC-084)',
  );
  const routeSources = listFiles('app/api', ['.ts']);
  equal(
    routeSources.filter((file) => /request-body/.test(readFileSync(join(root, file), 'utf8'))),
    [],
    'No route uses the unbounded legacy request-body helper',
  );
  equal(
    routeSources.filter((file) =>
      /request\.(json|text|formData|arrayBuffer|blob)\(/.test(readFileSync(join(root, file), 'utf8')),
    ),
    [],
    'Every route reads bodies only through the 128 KiB bounded helper',
  );
  const html = serverSources.filter((file) =>
    /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|document\.write|\beval\(|new Function\(/.test(
      readFileSync(join(root, file), 'utf8'),
    ),
  );
  equal(
    html,
    ['components/chart.tsx'].filter((file) => serverSources.includes(file)),
    'Only the vendored chart theme writer injects HTML (static, no user text), nothing evaluates strings',
  );
  const cors = serverSources.filter((file) =>
    /Access-Control-Allow/i.test(readFileSync(join(root, file), 'utf8')),
  );
  equal(cors, [], 'No CORS allowance exists anywhere');
  // Secret-bearing comparisons: tokens/state/browser values are only ever compared through a SHA-256 digest used as a
  // database equality key. The sole direct comparison of a secret-like value is the OIDC nonce after signature checks.
  const comparisons = listFiles('lib/education', ['.ts']).flatMap((file) =>
    readFileSync(join(root, file), 'utf8')
      .split('\n')
      .map((line, index) => ({ file, line: index + 1, text: line.trim() }))
      .filter(
        ({ text }) =>
          /(===|!==)/.test(text) &&
          /\b(token|secret|password|nonce|verifier|digest|codeChallenge|sessionHash)\b/i.test(text) &&
          (/payload\.nonce !== nonce/.test(text) ||
            !/typeof|tokenAuthMethod|\.length|clientSecret\b.*(!tokenAuth|\?)|id_token|\.protocol\b|\.(username|password)\b/.test(
              text,
            )),
      ),
  );
  // Reviewed allowlist. Each entry is an exact flagged line plus the reason it is not a credential comparison. The set of flagged
  // lines must equal this list exactly, so a new direct comparison fails and a stale entry fails too.
  const reviewedComparisons = {
    'lib/education/oidc.ts: payload.nonce !== nonce ||':
      'post-signature OIDC nonce check (documented, not remotely timing-exploitable)',
    // The idempotency fingerprint in assessment-lifecycle.ts (`const hash = await digest(JSON.stringify({... partial: data.partialConfirmed === true }))`)
    // used to be flagged because the whole call sat on one line. Prettier (8 October 2026) split it, so the `===` boolean test and the word
    // `digest` are no longer on the same line and the line-based scan no longer flags it. It remains a request fingerprint, not a credential.
  };
  equal(
    comparisons.map(({ file, text }) => `${file}: ${text.slice(0, 30)}`).sort(),
    Object.keys(reviewedComparisons).sort(),
    'Only the post-signature OIDC nonce check is flagged by the secret-comparison scan',
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Request body, query and identifier limits through the real handlers.
// ---------------------------------------------------------------------------------------------------------------
const f = await buildFixture();
async function streamed(actor, path, megabytes, method = 'POST') {
  let pulled = 0;
  const stream = new ReadableStream(
    {
      pull(controller) {
        if (pulled >= megabytes * 1024 * 1024) {
          controller.close();
          return;
        }
        pulled += 1024 * 1024;
        controller.enqueue(new Uint8Array(1024 * 1024).fill(32));
      },
    },
    { highWaterMark: 0 },
  );
  const response = await dispatch(
    new Request(origin + path, {
      method,
      headers: { origin, cookie: f.cookies[actor], 'content-type': 'application/json' },
      body: stream,
      duplex: 'half',
    }),
  );
  return { status: response.status, pulledMiB: pulled / (1024 * 1024) };
}
{
  const before = f.fingerprint();
  const bounded = [
    ['admin-a', '/api/courses'],
    ['admin-a', '/api/students'],
    ['teacher-a', '/api/resources'],
    ['admin-a', '/api/admin/users'],
    ['teacher-a', '/api/external-apps/oral-reading-fluency/launch'],
    ['teacher-a', '/api/curriculum'],
    ['student-user-a', `/api/assignments/${f.ids.assignment}/submissions`],
    ['admin-a', '/api/registry/students'],
  ];
  for (const [actor, path] of bounded) {
    const result = await streamed(actor, path, 40);
    equal(result.status, 400, `${path}: an unterminated 40 MiB body is refused as invalid`);
    check(
      result.pulledMiB <= 2,
      `${path}: at most ${result.pulledMiB} MiB were buffered before refusal (bound is 128 KiB per read)`,
    );
  }
  const exact = (n) => '{"name":"' + 'a'.repeat(n) + '"}';
  equal(
    (await f.call('admin-a', 'PATCH', '/api/schools/a', { rawBody: exact(131072 - 11 + 1) })).status,
    400,
    'a body one byte over 128 KiB is refused',
  );
  equal(
    (
      await f.call('admin-a', 'POST', '/api/courses', {
        rawBody: '{}',
        headers: { 'content-length': '999999999' },
      })
    ).status,
    400,
    'a declared oversize length is refused',
  );
  equal(
    (await f.call('admin-a', 'POST', '/api/courses', { rawBody: '{}', headers: { 'content-length': '-1' } }))
      .status,
    400,
    'a malformed length is refused',
  );
  equal(f.changedTables(before, f.fingerprint()), [], 'Refused bodies changed nothing');
  for (const [name, rawBody] of Object.entries({
    'deeply nested arrays': '['.repeat(100000),
    'deeply nested objects': '{"a":'.repeat(20000) + '1' + '}'.repeat(20000),
    'array instead of object': '[]',
    null: 'null',
    string: '"x"',
    number: '1',
    'invalid utf-8': new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d]),
    'truncated json': '{"name":',
    'NaN literal': '{"name":NaN}',
    'duplicate keys': '{"name":"a","name":}',
    'empty body': '',
  })) {
    const result = await f.call('admin-a', 'PATCH', '/api/schools/a', { rawBody });
    check(result.status === 400, `${name}: malformed JSON is 400, never 500 (${result.status})`);
    equal(result.json, { error: 'Invalid request' }, `${name}: no parser detail is returned`);
  }
  equal(f.changedTables(before, f.fingerprint()), [], 'Malformed bodies changed nothing');
}
{
  // Prototype pollution through JSON keys must neither pollute Object.prototype nor smuggle fields.
  const school = await f.call('admin-a', 'PATCH', '/api/schools/a', {
    rawBody:
      '{"name":"Pollution probe","__proto__":{"polluted":true,"role":"admin"},"constructor":{"prototype":{"polluted2":true}}}',
  });
  check([200, 400].includes(school.status), `prototype keys do not crash a legacy schema (${school.status})`);
  const strict = await f.call('teacher-a', 'POST', '/api/resources', {
    rawBody: '{"__proto__":{"polluted3":true},"content":1}',
  });
  equal(strict.status, 400, 'strict schema rejects prototype keys');
  equal(
    [{}.polluted, {}.role, {}.polluted2, {}.polluted3, Object.prototype.polluted],
    [undefined, undefined, undefined, undefined, undefined],
    'Object.prototype is untouched',
  );
  const session = await f.call('admin-a', 'GET', '/api/session');
  equal(session.json.role, 'admin', 'a polluted "role" could not change the resolved principal');
  const principal = f.sqlite.prepare("SELECT role FROM users WHERE id='admin-a'").get().role;
  equal(principal, 'admin', 'stored role unchanged');
}
{
  // Hostile identifiers and query values are bound parameters, never concatenated.
  const before = f.fingerprint();
  const identifiers = [
    "' OR 1=1 --",
    "'; DROP TABLE users; --",
    '%00',
    '..%2f..%2fetc%2fpasswd',
    'x'.repeat(5000),
    '<script>alert(1)</script>',
    '‮\u0000',
    'student-a%20',
  ];
  for (const id of identifiers) {
    for (const path of [
      '/api/students/',
      '/api/classes/',
      '/api/assessments/',
      '/api/report-cards/',
      '/api/courses/',
      '/api/schools/',
    ]) {
      const result = await f.call('admin-a', 'GET', path + encodeURIComponent(id));
      check([400, 404].includes(result.status), `${path}<hostile>: ${result.status}`);
      equal(result.json, { error: result.json?.error }, 'safe error body only');
    }
    const query = await f.call(
      'admin-a',
      'GET',
      '/api/enrolments?classId=' + encodeURIComponent(id) + '&studentId=' + encodeURIComponent(id),
    );
    equal(
      [query.status, query.json],
      [200, []],
      'hostile query values select nothing and never widen the result',
    );
  }
  equal(
    (await f.call('admin-a', 'GET', '/api/users?role=' + encodeURIComponent("admin' OR '1'='1"))).status,
    400,
    'role filter is an enum',
  );
  equal(
    f.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE name='users'").get().n,
    1,
    'DROP TABLE never executed',
  );
  equal(f.changedTables(before, f.fingerprint()), [], 'Hostile identifiers changed nothing');
}
{
  // No existence oracle: an object the actor may not see is indistinguishable from one that does not exist.
  const i = f.ids;
  const oracle = [
    ['admin-b', (id) => `/api/students/${id}`, 'student-a'],
    ['admin-b', (id) => `/api/classes/${id}`, 'class-a'],
    ['admin-b', (id) => `/api/courses/${id}`, 'course-a'],
    ['admin-b', (id) => `/api/assessments/${id}`, 'assessment-a'],
    ['admin-b', (id) => `/api/assessments/${id}/results`, 'assessment-a'],
    ['admin-b', (id) => `/api/report-cards/${id}`, 'published-a'],
    ['admin-b', (id) => `/api/resources/${id}`, i.resource],
    ['admin-b', (id) => `/api/curriculum/${id}`, i.curriculum],
    ['admin-b', (id) => `/api/assignments/${id}/submissions`, i.assignment],
    ['admin-b', (id) => `/api/reading-checks/${id}/corrections`, i.reading],
    ['admin-b', (id) => `/api/reading-imports/${id}`, i.import],
    ['admin-b', (id) => `/api/schools/${id}`, 'a'],
    ['admin-b', (id) => `/api/classes/${id}/attendance-editor?date=2026-10-02`, 'class-a'],
    ['admin-b', (id) => `/api/assessments/${id}/result-editor`, 'assessment-a'],
    ['teacher-a', (id) => `/api/students/${id}`, 'student-other'],
    ['student-user-a', (id) => `/api/students/${id}`, 'student-peer'],
    ['teacher-a', (id) => `/api/resources/${id}`, i.resourceOther],
    ['teacher-a', (id) => `/api/curriculum/${id}`, i.curriculumOther],
    ['guardian-a', (id) => `/api/report-cards/${id}`, i.reportDraft],
    ['teacher-a', (id) => `/api/classes/${id}`, 'class-other'],
    ['guardian-a', (id) => `/api/classes/${id}`, 'class-other'],
    ['admin-a', (id) => `/api/guardians/${id}`, 'guardian-profile-b'],
  ];
  for (const [actor, path, real] of oracle) {
    const foreign = await f.call(actor, 'GET', path(real));
    const missing = await f.call(actor, 'GET', path('missing-' + crypto.randomUUID()));
    equal(
      [foreign.status, foreign.json],
      [missing.status, missing.json],
      `${actor} ${path(':id')}: an inaccessible object answers exactly like a missing one`,
    );
    equal(foreign.status, 404, `${actor} ${path(':id')}: not found, never a 403 that confirms existence`);
  }
}
{
  // Hostile text is stored and returned as literal data in JSON; markup is never interpreted by the API layer.
  const hostile = [
    '<script>alert(1)</script>',
    '"><img src=x onerror=alert(1)>',
    "Robert'); DROP TABLE students;--",
    '{{7*7}}${7*7}',
    'a‮b',
    'line1\r\nSet-Cookie: x=1',
    'null\u0000byte',
    '😀'.repeat(50),
  ];
  for (const text of hostile) {
    const patched = await f.call('admin-a', 'PATCH', '/api/schools/a', {
      body: { name: text, address: text },
    });
    equal(patched.status, 200, `hostile school text accepted as text: ${JSON.stringify(text.slice(0, 20))}`);
    equal(patched.json.name, text, 'stored and returned byte-for-byte as a JSON string');
    check(
      /^application\/json/.test(patched.headers.get('content-type')),
      'JSON content type prevents HTML interpretation',
    );
    equal(patched.headers.get('set-cookie'), null, 'CR/LF text cannot become a header');
    const read = await f.call('guardian-a', 'GET', '/api/schools/a');
    equal(read.json.name, text, 'read back identically by another role');
    check(!read.headers.get('x-injected'), 'no injected response header');
  }
  equal(f.sqlite.prepare('SELECT count(*) n FROM students').get().n, 5, 'No SQL fragment in stored text ran');
}

// ---------------------------------------------------------------------------------------------------------------
// Session and cookie lifecycle.
// ---------------------------------------------------------------------------------------------------------------
{
  const sessions = f.sessions;
  const cookie = await sessions.createSession('admin-b');
  const parts = cookie.split('; ');
  const [name, token] = parts[0].split('=');
  equal(name, '__Host-saha_session', 'session cookie uses the __Host- prefix (Secure, Path=/, no Domain)');
  check(/^[A-Za-z0-9_-]{43}$/.test(token), 'token is 256 bits of base64url randomness');
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'])
    check(parts.includes(attribute), `session cookie sets ${attribute}`);
  check(!parts.some((part) => /^Domain=/i.test(part)), 'no Domain attribute (host-only)');
  const maxAge = Number(parts.find((part) => part.startsWith('Max-Age='))?.slice(8));
  check(maxAge > 0 && maxAge <= 8 * 60 * 60, `bounded lifetime (${maxAge}s)`);
  const stored = f.sqlite
    .prepare(
      'SELECT token_hash, user_id, created_at, expires_at FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC',
    )
    .all('admin-b');
  check(
    stored.every((row) => row.token_hash !== token) &&
      !JSON.stringify(f.sqlite.prepare('SELECT * FROM auth_sessions').all()).includes(token),
    'only a digest of the token is persisted, never the token',
  );
  check(
    stored[0].expires_at - stored[0].created_at === maxAge * 1000,
    'server expiry equals the cookie lifetime',
  );
  const second = (await sessions.createSession('admin-b')).split('; ')[0].split('=')[1];
  check(second !== token, 'every sign-in issues a fresh token (no fixation by reuse)');
  equal(
    (await f.call('admin-b', 'GET', '/api/session', { cookie: `__Host-saha_session=${token}` })).status,
    200,
    'issued token authenticates',
  );
  // A token chosen by an attacker (never issued by the server) cannot become a session.
  const planted = 'Z'.repeat(43);
  equal(
    (await f.call(null, 'GET', '/api/session', { cookie: `__Host-saha_session=${planted}` })).status,
    401,
    'planted session id is not accepted',
  );
  equal(
    f.sqlite.prepare('SELECT count(*) n FROM auth_sessions WHERE token_hash = ?').get(planted).n,
    0,
    'a presented token is never adopted into storage',
  );
  // Revocation is server-side and exact.
  await sessions.revokeSession(
    new Request(origin + '/', { headers: { cookie: `__Host-saha_session=${token}` } }),
  );
  equal(
    (await f.call(null, 'GET', '/api/session', { cookie: `__Host-saha_session=${token}` })).status,
    401,
    'revoked token stops working',
  );
  equal(
    (await f.call(null, 'GET', '/api/session', { cookie: `__Host-saha_session=${second}` })).status,
    200,
    "revoking one session leaves the account's other session intact",
  );
  await sessions.revokeUserSessions('admin-b');
  equal(
    (await f.call(null, 'GET', '/api/session', { cookie: `__Host-saha_session=${second}` })).status,
    401,
    'revokeUserSessions ends every session of the account',
  );
  // Sign-out clears a presented cookie and expires it with matching attributes; works even with no session.
  const out = await f.call(null, 'DELETE', '/api/session');
  equal(out.status, 200, 'sign-out with no session still succeeds');
  const cleared = out.headers.get('set-cookie');
  check(
    /__Host-saha_session=; /.test(cleared) &&
      /Max-Age=0/.test(cleared) &&
      /HttpOnly/.test(cleared) &&
      /Secure/.test(cleared),
    'sign-out expires the cookie with matching attributes',
  );
  // Account state changes end authority immediately on the existing session.
  const teacherSession = f.cookies['teacher-a'];
  equal(
    (await f.call(null, 'GET', '/api/students', { cookie: teacherSession })).status,
    200,
    'teacher session works',
  );
  f.sqlite.prepare("UPDATE users SET disabled_at = 'x' WHERE id = 'teacher-a'").run();
  equal(
    (await f.call(null, 'GET', '/api/students', { cookie: teacherSession })).status,
    401,
    'disabling the account ends the existing session at once',
  );
  f.sqlite.prepare('UPDATE users SET disabled_at = NULL WHERE id = ?').run('teacher-a');
  f.sqlite.prepare("UPDATE users SET role = 'student' WHERE id = 'teacher-a'").run();
  const demoted = await f.call(null, 'GET', '/api/session', { cookie: teacherSession });
  check(
    demoted.status === 401 || demoted.json.role === 'student',
    'a demoted account never keeps the old role on an existing session',
  );
  f.sqlite.prepare("UPDATE users SET role = 'teacher' WHERE id = 'teacher-a'").run();
}

// ---------------------------------------------------------------------------------------------------------------
// Login throttling (spec: "login can return 429"), with a stubbed discovery document and no network.
// ---------------------------------------------------------------------------------------------------------------
{
  Object.assign(bindings, {
    SAHA_OIDC_ISSUER: 'https://identity.example.invalid',
    SAHA_OIDC_CLIENT_ID: 'synthetic-client',
    SAHA_OIDC_REDIRECT_URL: origin + '/api/auth/callback',
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (!url.endsWith('/.well-known/openid-configuration')) {
      externalRequests++;
      throw new Error('Unexpected fetch ' + url);
    }
    return Response.json({
      issuer: 'https://identity.example.invalid',
      authorization_endpoint: 'https://identity.example.invalid/authorize',
      token_endpoint: 'https://identity.example.invalid/token',
      jwks_uri: 'https://identity.example.invalid/jwks',
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['none'],
    });
  };
  const start = (ip) => f.call(null, 'POST', '/api/auth/login', { headers: { 'cf-connecting-ip': ip } });
  const first = await start('203.0.113.7');
  equal(first.status, 200, 'sign-in start succeeds under the limit');
  const url = new URL(first.json.url);
  check(
    url.searchParams.get('code_challenge_method') === 'S256' &&
      url.searchParams.get('state')?.length === 43 &&
      url.searchParams.get('nonce')?.length === 43,
    'authorization request uses PKCE S256 with unguessable state and nonce',
  );
  const transaction = first.headers.get('set-cookie');
  check(
    /^__Host-saha_oidc=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=300$/.test(
      transaction,
    ),
    'transaction cookie is host-only, HttpOnly, Secure, short-lived',
  );
  equal(first.headers.get('cache-control'), 'no-store', 'sign-in start is not cacheable');
  equal(first.headers.get('referrer-policy'), 'no-referrer', 'no referrer leaks the state');
  check(
    !f.sqlite
      .prepare('SELECT state_hash, browser_hash FROM oidc_transactions')
      .all()
      .some((row) => url.href.includes(row.state_hash) || transaction.includes(row.browser_hash)),
    'only digests of state and browser value are stored',
  );
  let throttled = null;
  for (let attempt = 2; attempt <= 25; attempt++) {
    const result = await start('203.0.113.7');
    if (result.status === 429) {
      throttled = attempt;
      equal(result.json, { error: 'Too many sign-in attempts; try again later' }, 'throttle message is safe');
      break;
    }
  }
  equal(
    throttled,
    21,
    'the 21st sign-in start from one address within ten minutes is throttled (documented limit 20)',
  );
  equal((await start('203.0.113.99')).status, 200, 'another address is not throttled by the first');
  equal(
    (await f.call(null, 'POST', '/api/auth/login', { origin: 'https://attacker.example.invalid' })).status,
    403,
    'cross-origin sign-in start is refused before throttling or discovery',
  );
  // A callback with a valid-looking state but another browser's transaction cookie cannot consume the transaction.
  const state = url.searchParams.get('state');
  const rows = f.sqlite.prepare('SELECT count(*) n FROM oidc_transactions').get().n;
  const sessionRows = f.sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n;
  const stolen = await f.call(null, 'GET', `/api/auth/callback?state=${state}&code=abc`, {
    cookie: `__Host-saha_oidc=${'B'.repeat(43)}`,
  });
  equal(
    [stolen.status, stolen.response.headers.get('location')],
    [303, '/login?error=signin_failed'],
    'wrong browser binding fails closed',
  );
  equal(
    f.sqlite.prepare('SELECT count(*) n FROM oidc_transactions').get().n,
    rows,
    "a wrong-browser callback cannot burn the victim's pending transaction",
  );
  equal(
    f.sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n,
    sessionRows,
    'no session is created by a failed callback',
  );
  for (const key of ['SAHA_OIDC_ISSUER', 'SAHA_OIDC_CLIENT_ID', 'SAHA_OIDC_REDIRECT_URL'])
    delete bindings[key];
  globalThis.fetch = async () => {
    externalRequests++;
    throw new Error('Offline');
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Error and log leakage: injected infrastructure failures surface only the generic message; nothing is logged.
// ---------------------------------------------------------------------------------------------------------------
{
  const logged = [];
  const originals = Object.fromEntries(
    ['log', 'info', 'warn', 'error', 'debug'].map((name) => [name, console[name]]),
  );
  for (const name of Object.keys(originals))
    console[name] = (...args) => {
      logged.push(args.map(String).join(' '));
    };
  const realDb = globalThis.__sahaTestDb;
  const secrets = ['SECRET-LEARNER-MARKER', f.token('guardian-a'), f.cookies['guardian-a']];
  // 1. a database failure at the first statement of an authenticated read
  globalThis.__sahaTestDb = new Proxy(realDb, {
    get(target, property) {
      if (property === 'select')
        return () => {
          throw new Error('SQLITE_ERROR: no such table: students (SECRET-LEARNER-MARKER)');
        };
      return Reflect.get(target, property, target);
    },
  });
  const broken = await dispatch(
    new Request(origin + '/api/students', { headers: { cookie: f.cookies['admin-a'] } }),
  );
  globalThis.__sahaTestDb = realDb;
  // The session lookup itself uses select, so the failure is a 401 (fail closed) rather than a leak.
  check([401, 500, 503].includes(broken.status), `an infrastructure failure fails closed (${broken.status})`);
  const brokenText = await broken.text();
  check(
    !/SQLITE|SECRET|no such table|students/.test(brokenText.replace('"error"', '')),
    'failure body contains no SQL or learner text',
  );
  // 2. a constraint violation after authorization (duplicate global course code => unique violation)
  const duplicate = {
    schoolId: 'a',
    code: 'course-a',
    title: 'SECRET-LEARNER-MARKER duplicate',
    gradeLevel: '8',
  };
  const conflict = await f.call('admin-a', 'POST', '/api/courses', { body: duplicate });
  check([409, 500].includes(conflict.status), `duplicate code is a controlled failure (${conflict.status})`);
  check(
    !/UNIQUE|constraint|SQLITE|courses\.code|SECRET/.test(conflict.text),
    'constraint details are never returned',
  );
  // 3. a thrown non-HTTP error inside a handler body
  globalThis.__sahaTestDb = new Proxy(realDb, {
    get(target, property) {
      if (property === 'insert')
        return () => {
          throw new Error('boom SECRET-LEARNER-MARKER at /srv/app.ts:12');
        };
      return Reflect.get(target, property, target);
    },
  });
  const thrown = await f.call('admin-a', 'POST', '/api/courses', {
    body: {
      schoolId: 'a',
      code: 'x-' + crypto.randomUUID().slice(0, 6),
      title: 'SECRET-LEARNER-MARKER',
      gradeLevel: '8',
    },
  });
  globalThis.__sahaTestDb = realDb;
  equal(
    [thrown.status, thrown.json],
    [500, { error: 'Internal server error' }],
    'unexpected errors are a generic 500',
  );
  for (const name of Object.keys(originals)) console[name] = originals[name];
  check(
    logged.every((line) => !secrets.some((secret) => line.includes(secret))),
    'nothing logged contains a session token or learner marker',
  );
  equal(logged.length, 0, `request handling writes nothing to the console (${logged.length} lines)`);
}

check(externalRequests === 0, `no external request (${externalRequests})`);
globalThis.fetch = realFetch;
console.log(`Security hardening: ${checks} checks passed (real handlers, synthetic SQLite, offline).`);
console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
