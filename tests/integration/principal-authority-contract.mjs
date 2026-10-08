import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings } from '../support/security-db.mjs';

const sessions = await load('lib/education/session.ts');
const identity = await load('lib/education/identity.ts');
const auth = await load('lib/education/auth.ts');
const access = await load('lib/education/access.ts');
const students = await load('lib/education/students.ts');
const sessionRoute = await load('app/api/session/route.ts');
const studentRoute = await load('app/api/students/route.ts');
const demoPolicy = await load('lib/education/demo-policy.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
let checks = 0,
  scenarios = 0;
const check = (actual, expected, message) => {
  assert.deepEqual(actual, expected, message);
  checks++;
};

function installProductionDriver(fixture) {
  const { sqlite, schema } = fixture;
  function prepare(query, values = []) {
    return {
      bind(...next) {
        return prepare(query, next);
      },
      async raw() {
        const statement = sqlite.prepare(query);
        statement.setReturnArrays(true);
        return statement.all(...values);
      },
      async all() {
        return { success: true, results: sqlite.prepare(query).all(...values), meta: {} };
      },
      async run() {
        const statement = sqlite.prepare(query);
        const result = statement.columns().length ? statement.all(...values) : statement.run(...values);
        return { success: true, results: Array.isArray(result) ? result : [], meta: {} };
      },
    };
  }
  const db = drizzle({ prepare }, { schema });
  globalThis.__sahaTestDb = db;
  return db;
}

async function scenario(action) {
  const fixture = freshDatabase();
  await seedSecurityData(fixture.db, fixture.schema);
  const { sqlite, schema } = fixture;
  const db = installProductionDriver(fixture);
  const cookie = (await sessions.createSession('admin-a')).split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const hash = await identity.digest(token);
  const principal = await auth.getPrincipal(new Request(origin + '/api/session', { headers: { cookie } }));
  assert.ok(principal);
  checks++;
  const currentActor = (actor) =>
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, actor.id), access.livePrincipalScope(actor)));
  try {
    await action({ ...fixture, db, cookie, token, hash, principal, currentActor });
    scenarios++;
  } finally {
    sqlite.close();
  }
}

await scenario(async ({ cookie, token, hash, principal }) => {
  check(
    Object.isFrozen(principal),
    true,
    'A verified request principal cannot be rewritten after resolution',
  );
  check(
    Object.keys(principal).sort(),
    ['id', 'role', 'schoolId'],
    'Verified session context is not an enumerable principal field',
  );
  check(Object.getOwnPropertySymbols(principal), [], 'Session authority is not exposed as a symbol property');
  const response = await sessionRoute.GET(new Request(origin + '/api/session', { headers: { cookie } }));
  check(response.status, 200, 'The session endpoint keeps its existing authenticated status');
  const body = await response.text();
  check(
    JSON.parse(body),
    { id: 'admin-a', role: 'admin', schoolId: 'a' },
    'Public session JSON keeps its exact existing DTO',
  );
  for (const privateValue of [token, hash, 'sub-admin-a', 'identity.example.invalid'])
    check(
      body.includes(privateValue),
      false,
      'Session proof and provider identity do not leave the endpoint',
    );
  assert.throws(() => {
    principal.role = 'teacher';
  }, TypeError);
  checks++;
});

const demoSettings = [
  'SAHA_DEMO_ENABLED',
  'SAHA_DEMO_INSTALLATION_ID',
  'SAHA_OIDC_ISSUER',
  'SAHA_OIDC_CLIENT_ID',
  'SAHA_OIDC_CLIENT_SECRET',
  'SAHA_OIDC_REDIRECT_URL',
  'SAHA_OIDC_TOKEN_AUTH_METHOD',
];
const demoInstallationId = '7dfd4af3-592c-4ead-ab96-1f43457bdc51';
async function demoScenario(action) {
  const savedSettings = new Map(demoSettings.map((key) => [key, bindings[key]]));
  for (const key of demoSettings) bindings[key] = '';
  bindings.SAHA_DEMO_ENABLED = 'true';
  bindings.SAHA_DEMO_INSTALLATION_ID = demoInstallationId;
  const fixture = freshDatabase();
  const { sqlite, schema } = fixture;
  const db = installProductionDriver(fixture);
  const stamp = '2026-10-05T19:18:00.000Z';
  await db.insert(schema.schools).values({
    id: demoPolicy.DEMO_SCHOOL_ID,
    name: 'Synthetic isolation control',
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(schema.users).values({
    id: 'private-demo-actor',
    name: 'Synthetic actor',
    role: 'admin',
    schoolId: demoPolicy.DEMO_SCHOOL_ID,
    email: 'private-demo-actor@example.invalid',
    identityIssuer: demoPolicy.DEMO_ISSUER,
    identitySubject: 'private-demo-subject',
    createdAt: stamp,
    updatedAt: stamp,
  });
  await db.insert(schema.demoInstallations).values({
    id: demoInstallationId,
    schoolId: demoPolicy.DEMO_SCHOOL_ID,
    seedNonce: 'private-test-only',
    createdAt: stamp,
  });
  const cookie = (await sessions.createSession('private-demo-actor')).split(';')[0];
  const token = cookie.slice(cookie.indexOf('=') + 1);
  const hash = await identity.digest(token);
  const currentActor = (principal) =>
    db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.id, principal.id), access.livePrincipalScope(principal)));
  try {
    await action({ ...fixture, db, cookie, token, hash, currentActor });
    scenarios++;
  } finally {
    sqlite.close();
    for (const [key, value] of savedSettings) {
      if (value === undefined) delete bindings[key];
      else bindings[key] = value;
    }
  }
}

await demoScenario(async ({ token, cookie, currentActor }) => {
  const principal = await sessions.principalForToken(token);
  assert.ok(principal);
  checks++;
  check(
    await currentActor(principal),
    [{ id: 'private-demo-actor' }],
    'An explicitly installed isolated synthetic session can exercise current scoped SQL',
  );
  const response = await sessionRoute.GET(new Request(origin + '/api/session', { headers: { cookie } }));
  check(
    response.status,
    200,
    'A configured private synthetic session resolves through the regular HTTP cookie path',
  );
  check(
    await response.json(),
    { id: 'private-demo-actor', role: 'admin', schoolId: demoPolicy.DEMO_SCHOOL_ID },
    'Synthetic session DTO contains no installation or opaque authority evidence',
  );
});

for (const key of [
  'SAHA_DEMO_ENABLED',
  'SAHA_DEMO_INSTALLATION_ID',
  'SAHA_OIDC_ISSUER',
  'SAHA_OIDC_CLIENT_ID',
  'SAHA_OIDC_CLIENT_SECRET',
  'SAHA_OIDC_REDIRECT_URL',
  'SAHA_OIDC_TOKEN_AUTH_METHOD',
])
  await demoScenario(async ({ token, currentActor }) => {
    const principal = await sessions.principalForToken(token);
    assert.ok(principal);
    checks++;
    bindings[key] =
      key === 'SAHA_DEMO_ENABLED'
        ? 'false'
        : key === 'SAHA_DEMO_INSTALLATION_ID'
          ? 'malformed'
          : 'synthetic-configured';
    check(
      await currentActor(principal),
      [],
      'A reserved synthetic execution identity closes when its runtime isolation configuration is unavailable',
    );
    check(
      await sessions.principalForToken(token),
      null,
      'Reserved synthetic cookie resolution also fails closed under partial provider configuration',
    );
  });

await demoScenario(async ({ sqlite, token, currentActor }) => {
  const principal = await sessions.principalForToken(token);
  assert.ok(principal);
  checks++;
  const deferred = currentActor(principal);
  sqlite.exec('DELETE FROM demo_installations');
  check(await deferred, [], 'Removing the installation after SQL construction denies the actual statement');
  check(
    await sessions.principalForToken(token),
    null,
    'A synthetic account cannot authenticate without current installation evidence',
  );
});

await demoScenario(async ({ token, currentActor }) => {
  const principal = await sessions.principalForToken(token);
  assert.ok(principal);
  checks++;
  bindings.SAHA_DEMO_INSTALLATION_ID = 'c5e13503-5be9-4b94-8088-4ba3830869c6';
  check(
    await currentActor(principal),
    [],
    'A differently configured installation cannot use an older synthetic account session',
  );
  check(
    await sessions.principalForToken(token),
    null,
    'The installation identifier must match the current database marker',
  );
});

for (const column of ['identity_issuer', 'school_id'])
  await demoScenario(async ({ sqlite, token, currentActor }) => {
    const principal = await sessions.principalForToken(token);
    assert.ok(principal);
    checks++;
    const deferred = currentActor(principal);
    const issuer = column === 'identity_issuer' ? null : demoPolicy.DEMO_ISSUER;
    const school = column === 'school_id' ? null : demoPolicy.DEMO_SCHOOL_ID;
    sqlite
      .prepare(
        'INSERT INTO users(id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .run(
        'private-contamination',
        'Synthetic contamination',
        'private-contamination@example.invalid',
        'admin',
        school,
        issuer,
        'private-other-subject',
        'test',
        'test',
      );
    check(
      await deferred,
      [],
      'A new unmapped or mixed-school account closes the actual reserved-issuer statement',
    );
    check(
      await sessions.principalForToken(token),
      null,
      'An installation marker alone never authorizes a contaminated synthetic database',
    );
  });

await demoScenario(async ({ sqlite, token, currentActor }) => {
  const principal = await sessions.principalForToken(token);
  assert.ok(principal);
  checks++;
  const deferred = currentActor(principal);
  sqlite
    .prepare('INSERT INTO schools(id,name,created_at,updated_at) VALUES(?,?,?,?)')
    .run('private-non-demo-school', 'Synthetic separate school', 'test', 'test');
  check(
    await deferred,
    [],
    'Additional school evidence closes the actual synthetic statement even without another account',
  );
  check(
    await sessions.principalForToken(token),
    null,
    'A reserved synthetic identity cannot resolve from a database with another school',
  );
});

await demoScenario(async ({ sqlite, token, hash, currentActor }) => {
  const principal = await sessions.principalForToken(token);
  assert.ok(principal);
  checks++;
  sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash);
  check(
    await currentActor(principal),
    [],
    'The synthetic installation cannot bypass exact-session revocation',
  );
  check(
    await sessions.principalForToken(token),
    null,
    'An installed demo still requires an actual live opaque cookie',
  );
});

await scenario(async ({ sqlite, principal, hash, currentActor }) => {
  const deferred = currentActor(principal);
  sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash);
  check(
    await deferred,
    [],
    'A query built before revocation checks the exact session at actual SQL execution',
  );
  const newCookie = (await sessions.createSession('admin-a')).split(';')[0];
  check(
    await currentActor(principal),
    [],
    'Another active login does not rescue the deleted original session',
  );
  const newPrincipal = await auth.getPrincipal(
    new Request(origin + '/api/session', { headers: { cookie: newCookie } }),
  );
  check(
    await currentActor(newPrincipal),
    [{ id: 'admin-a' }],
    'A newly verified current session supplies independent execution authority',
  );
});

await scenario(async ({ sqlite, principal, hash, token, currentActor }) => {
  sqlite.prepare('UPDATE auth_sessions SET expires_at=0 WHERE token_hash=?').run(hash);
  check(await currentActor(principal), [], 'Resolved authority expires at the database statement clock');
  check(
    await sessions.principalForToken(token),
    null,
    'Expired cookies remain unauthenticated on the next resolution',
  );
});

await scenario(async ({ sqlite, token, hash, currentActor }) => {
  globalThis.__sahaCookies = [{ name: sessions.SESSION_COOKIE, value: token }];
  try {
    const principal = await auth.getServerPrincipal();
    check(
      await currentActor(principal),
      [{ id: 'admin-a' }],
      'Protected server pages resolve the same verified execution context',
    );
    sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash);
    check(
      await currentActor(principal),
      [],
      'A server-page principal cannot finish a private query after its session is revoked',
    );
    check(
      await auth.getServerPrincipal(),
      null,
      'Subsequent server-page resolution remains unauthenticated after revocation',
    );
  } finally {
    delete globalThis.__sahaCookies;
  }
});

for (const field of ['identity_issuer', 'identity_subject'])
  await scenario(async ({ sqlite, principal, currentActor }) => {
    sqlite
      .prepare(`UPDATE users SET ${field}=? WHERE id='admin-a'`)
      .run(field === 'identity_issuer' ? 'https://changed.example.invalid' : 'changed-subject');
    check(
      await currentActor(principal),
      [],
      'A different nonempty provider mapping cannot retain the earlier verified execution identity',
    );
    check(
      await currentActor({ id: 'admin-a', role: 'admin', schoolId: 'a' }),
      [{ id: 'admin-a' }],
      'Explicit trusted internal principals retain their existing current-account contract',
    );
  });

await scenario(async ({ sqlite, hash, principal }) => {
  sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hash);
  await assert.rejects(
    students.createStudent(principal, {
      schoolId: 'a',
      firstName: 'Synthetic',
      lastName: 'Blocked',
      dateOfBirth: '2012-01-01',
      admissionNumber: 'REVOKED-EXECUTION',
      gradeLevel: '8',
    }),
    (error) => error instanceof access.AccessError,
  );
  checks++;
  check(
    sqlite.prepare("SELECT count(*) AS n FROM students WHERE admission_number='REVOKED-EXECUTION'").get().n,
    0,
    'Session revocation leaves no late legacy profile insert',
  );
  check(
    (await students.listStudents({ id: 'admin-a', role: 'admin', schoolId: 'a' })).length,
    2,
    'Trusted internal account-scoped service fixtures are preserved',
  );
  sqlite.prepare("UPDATE users SET disabled_at='synthetic-disabled' WHERE id='admin-a'").run();
  check(
    await students.listStudents({ id: 'admin-a', role: 'admin', schoolId: 'a' }),
    [],
    'Trusted internal compatibility never bypasses the live disabled-account guard',
  );
});

await scenario(async ({ principal, sqlite }) => {
  sqlite.exec('DELETE FROM auth_sessions');
  const request = new Request(origin + '/api/students', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'x-user-id': 'admin-a', 'x-user-role': 'admin' },
    body: JSON.stringify({
      principal,
      sessionTokenHash: 'invented',
      schoolId: 'a',
      firstName: 'Synthetic',
      lastName: 'Forged',
      dateOfBirth: '2012-01-01',
      admissionNumber: 'FORGED-PUBLIC',
      gradeLevel: '8',
    }),
  });
  const response = await studentRoute.POST(request);
  check(
    response.status,
    401,
    'Public principal JSON and identity headers cannot replace a missing HTTP session',
  );
  check(
    await response.json(),
    { error: 'Authentication required' },
    'Missing-session denial exposes only the existing safe error',
  );
  check(
    sqlite.prepare("SELECT count(*) AS n FROM students WHERE admission_number='FORGED-PUBLIC'").get().n,
    0,
    'A forged public DTO cannot create a trusted service principal',
  );
});

console.log(
  JSON.stringify({
    passed: checks,
    failed: 0,
    skipped: 0,
    scenarios,
    scope:
      'actual opaque sessions/routes and production D1 prepared mapping over isolated SQLite; no external services',
  }),
);
