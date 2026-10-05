// Actual route/session/domain services over the production D1 query mapping and
// a fully migrated isolated SQLite database. Fictional rows only; no provider.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const routes = {
  demo: await load('app/api/demo/route.ts'), session: await load('app/api/session/route.ts'),
  students: await load('app/api/students/route.ts'),
};
const sessions = await load('lib/education/session.ts');
const studentsService = await load('lib/education/students.ts');
const policy = await load('lib/education/demo-policy.ts');
const demoService = await load('lib/education/demo.ts');
const origin = 'https://education.example.invalid';
const installation = '908df258-dff2-43d4-a540-503b2c7e7d13';
const oidcKeys = ['SAHA_OIDC_ISSUER', 'SAHA_OIDC_CLIENT_ID', 'SAHA_OIDC_CLIENT_SECRET', 'SAHA_OIDC_REDIRECT_URL', 'SAHA_OIDC_TOKEN_AUTH_METHOD'];
let passed = 0, scenarios = 0, requests = 0, externalCalls = 0;
let statementHook = null;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const count = (database, table) => database.prepare(`SELECT count(*) n FROM "${table}"`).get().n;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { externalCalls++; throw new Error('External calls are forbidden in the synthetic demo contract'); };
function configure() {
  for (const key of [...oidcKeys, 'SAHA_DEMO_ENABLED', 'SAHA_DEMO_INSTALLATION_ID']) delete bindings[key];
  bindings.SAHA_ALLOWED_ORIGINS = origin;
}
function actualD1Database() {
  const fixture = freshDatabase();
  function prepare(query, values = []) {
    function intercept(phase) {
      if (statementHook?.phase === phase && statementHook.match(query)) {
        const action = statementHook.action; statementHook = null; action(fixture.sqlite);
      }
    }
    return {
      bind(...bound) { return prepare(query, bound); },
      async raw() { intercept('before'); const statement = fixture.sqlite.prepare(query); statement.setReturnArrays(true); const results = statement.all(...values); intercept('after'); return results; },
      async all() { intercept('before'); const results = fixture.sqlite.prepare(query).all(...values); intercept('after'); return { success: true, results, meta: {} }; },
      async run() {
        intercept('before');
        const statement = fixture.sqlite.prepare(query);
        if (statement.columns().length) { const results = statement.all(...values); intercept('after'); return { success: true, results, meta: {} }; }
        const result = statement.run(...values);
        intercept('after');
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      },
    };
  }
  fixture.db = drizzle({ prepare, async batch(statements) {
    fixture.sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); fixture.sqlite.exec('COMMIT'); return results; }
    catch (error) { fixture.sqlite.exec('ROLLBACK'); throw error; }
  } }, { schema: fixture.schema });
  globalThis.__sahaTestDb = fixture.db;
  return fixture;
}
function request(payload, cookie, suppliedOrigin = origin) {
  return new Request(origin + '/api/demo', { method: 'POST', headers: {
    origin: suppliedOrigin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}),
  }, body: JSON.stringify(payload) });
}
async function invoke(payload, expected, cookie, suppliedOrigin) {
  requests++;
  const response = await routes.demo.POST(request(payload, cookie, suppliedOrigin));
  check(response.status, expected, 'Demo route returns the specified safe outcome');
  check(response.headers.get('cache-control'), 'no-store', 'Demo responses are uncached');
  const data = await response.json();
  if (expected === 200) {
    check(data, { destination: '/', synthetic: true }, 'No account/token/identity is returned in the demo DTO');
    const setCookie = response.headers.get('set-cookie') || '';
    check(/^__Host-saha_session=[A-Za-z0-9_-]{43};/.test(setCookie), true, 'Demo creates an actual opaque session cookie');
    for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) check(setCookie.includes(attribute), true, 'Session cookie retains its security attribute');
    return setCookie.split(';')[0];
  }
  check(response.headers.get('set-cookie'), null, 'Denied demo entry creates no session cookie');
  return data;
}
async function current(cookie, expected) {
  requests++;
  const response = await routes.session.GET(new Request(origin + '/api/session', { headers: { cookie } }));
  check(response.status, expected, 'Reserved demo session remains configuration/installation scoped');
  check(response.headers.get('cache-control'), 'no-store', 'Session DTO stays uncached');
  return response.json();
}

try {
  configure();
  let fixture = actualD1Database();
  scenarios++;
  const unavailable = await routes.demo.GET(); requests++;
  check(await unavailable.json(), { available: false, synthetic: true }, 'Demo is unavailable by default');
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 404);
  check(count(fixture.sqlite, 'users'), 0, 'Default-off path never creates sample accounts');
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 403, undefined, 'https://other.example.invalid');
  scenarios++;
  bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = 'invalid';
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 404);
  bindings.SAHA_DEMO_INSTALLATION_ID = installation;
  for (const payload of [{ role: 'owner', syntheticAcknowledged: true }, { role: 'admin' },
    { role: 'admin', syntheticAcknowledged: false }, { role: 'admin', syntheticAcknowledged: true, userId: 'other' },
    { role: 'admin', syntheticAcknowledged: true, schoolId: 'other' }]) {
    scenarios++; await invoke(payload, 400); check(count(fixture.sqlite, 'users'), 0, 'Malformed public data cannot seed or choose an identity');
  }
  scenarios++;
  const cookies = {};
  for (const [role, expectedCount] of [['admin', 3], ['teacher', 3], ['guardian', 2], ['student', 1]]) {
    const cookie = cookies[role] = await invoke({ role, syntheticAcknowledged: true }, 200);
    const principal = await current(cookie, 200);
    check(principal, { id: `saha-demo-${role}`, role, schoolId: policy.DEMO_SCHOOL_ID }, 'Only the fixed preprovisioned synthetic account is selected');
    requests++;
    const response = await routes.students.GET(new Request(origin + '/api/students', { headers: { cookie, 'x-user-role': 'admin' } }));
    check(response.status, 200, 'Normal authenticated scoped API works for the demo');
    const data = await response.json();
    check(data.length, expectedCount, 'Demo retains server role/profile/class scoping');
    check(data.every(row => row.schoolId === policy.DEMO_SCHOOL_ID), true, 'Every returned learner belongs to the isolated school');
  }
  check(count(fixture.sqlite, 'demo_installations'), 1, 'One installation marker is committed');
  check(count(fixture.sqlite, 'users'), 4, 'Four bounded fictional accounts are committed');
  check(count(fixture.sqlite, 'schools'), 1, 'One fictional school is committed');
  check(count(fixture.sqlite, 'resource_assignments'), 1, 'Teacher/learner demo has an approved manual resource assignment');
  check(fixture.sqlite.prepare('PRAGMA foreign_key_check').all(), [], 'All demo domain foreign keys are coherent');
  scenarios++;
  fixture.sqlite.exec("UPDATE students SET first_name='Edited fictional learner' WHERE id='saha-demo-learner-1'");
  const switched = await invoke({ role: 'guardian', syntheticAcknowledged: true }, 200, cookies.admin);
  await current(cookies.admin, 401);
  await current(switched, 200);
  check(count(fixture.sqlite, 'students'), 3, 'Repeated entry creates no duplicate profiles');
  check(fixture.sqlite.prepare("SELECT first_name n FROM students WHERE id='saha-demo-learner-1'").get().n, 'Edited fictional learner', 'Later entry never resets edited fictional records');
  scenarios++;
  let principal = await sessions.principalForToken(switched.split('=')[1]);
  bindings.SAHA_DEMO_ENABLED = 'false';
  await current(switched, 401);
  check(await studentsService.listStudents(principal), [], 'Disabling demo also closes actual SQL access of a previously resolved Principal');
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 404);
  bindings.SAHA_DEMO_ENABLED = 'true';
  for (const key of oidcKeys) {
    scenarios++; bindings[key] = 'configured';
    await current(switched, 401); await invoke({ role: 'admin', syntheticAcknowledged: true }, 404);
    check(await studentsService.listStudents(principal), [], 'Every provider configuration closes previously resolved demo SQL authority');
    delete bindings[key];
  }
  scenarios++;
  bindings.SAHA_DEMO_INSTALLATION_ID = '714c3999-8548-466f-a0b7-a9d5c07f20f9';
  await current(switched, 401);
  check(await studentsService.listStudents(principal), [], 'Installation rotation closes actual statement authority');
  bindings.SAHA_DEMO_INSTALLATION_ID = installation;
  scenarios++;
  fixture.sqlite.exec('DELETE FROM demo_installations');
  await current(switched, 401);
  check(await studentsService.listStudents(principal), [], 'Marker deletion closes actual statement authority');
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 503);
  check(count(fixture.sqlite, 'users'), 4, 'Missing marker never reseeds populated records');
  scenarios++;
  configure(); bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = installation;
  fixture = actualD1Database(); await seedSecurityData(fixture.db, fixture.schema);
  const before = fixture.sqlite.prepare('SELECT id,name,identity_issuer FROM users ORDER BY id').all();
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 503);
  check(fixture.sqlite.prepare('SELECT id,name,identity_issuer FROM users ORDER BY id').all(), before, 'Existing school/provider accounts are not changed by a demo request');
  check(count(fixture.sqlite, 'demo_installations'), 0, 'Populated database refuses a synthetic installation claim');
  scenarios++;
  fixture = actualD1Database();
  fixture.sqlite.exec("CREATE TRIGGER synthetic_seed_failure BEFORE INSERT ON students BEGIN SELECT RAISE(ABORT,'synthetic failure'); END;");
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 503);
  for (const table of ['demo_installations', 'schools', 'users', 'students']) check(count(fixture.sqlite, table), 0, 'A seed failure atomically rolls back marker and every prior sample row');
  fixture.sqlite.exec('DROP TRIGGER synthetic_seed_failure');
  const recovered = await invoke({ role: 'admin', syntheticAcknowledged: true }, 200);
  await current(recovered, 200);
  scenarios++;
  principal = await sessions.principalForToken(recovered.split('=')[1]);
  fixture.sqlite.exec("INSERT INTO schools VALUES('other-school','Outside school',NULL,'synthetic','synthetic')");
  await current(recovered, 401); check(await studentsService.listStudents(principal), [], 'An additional school contaminates the isolated demo and closes current authority');
  fixture.sqlite.exec("DELETE FROM schools WHERE id='other-school'");
  scenarios++;
  fixture.sqlite.exec("UPDATE users SET identity_issuer='https://other.example.invalid' WHERE id='saha-demo-teacher'");
  await current(recovered, 401); check(await studentsService.listStudents(principal), [], 'Any outside issuer closes all demo access, including already resolved statements');
  await invoke({ role: 'admin', syntheticAcknowledged: true }, 403);
  for (const [name, action] of [
    ['selected role changed', database => database.exec("UPDATE users SET role='admin' WHERE id='saha-demo-teacher'")],
    ['selected account disabled', database => database.exec("UPDATE users SET disabled_at='synthetic-disabled' WHERE id='saha-demo-teacher'")],
    ['selected subject changed', database => database.exec("UPDATE users SET identity_subject='synthetic-changed' WHERE id='saha-demo-teacher'")],
    ['installation removed', database => database.exec('DELETE FROM demo_installations')],
    ['another school configured', database => database.exec("INSERT INTO schools VALUES('other','Synthetic outside school',NULL,'test','test')")],
  ]) {
    scenarios++;
    configure(); bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = installation;
    fixture = actualD1Database(); await demoService.initializeSyntheticDemo();
    statementHook = { phase: 'before', match: query => /insert into "auth_sessions"/i.test(query), action };
    await invoke({ role: 'teacher', syntheticAcknowledged: true }, 403);
    check(statementHook, null, 'Concurrent configuration control was applied at actual session persistence: ' + name);
    check(count(fixture.sqlite, 'auth_sessions'), 0, 'Changed selected account/configuration produces no session: ' + name);
  }
  scenarios++;
  configure(); bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = installation;
  fixture = actualD1Database(); await demoService.initializeSyntheticDemo();
  statementHook = { phase: 'after', match: query => /insert into "auth_sessions"/i.test(query),
    action: database => database.exec("UPDATE users SET role='admin' WHERE id='saha-demo-teacher'") };
  await invoke({ role: 'teacher', syntheticAcknowledged: true }, 403);
  check(statementHook, null, 'A changed selected role after persistence is checked before response delivery');
  check(count(fixture.sqlite, 'auth_sessions'), 0, 'An unconfirmed new session is removed before issuing a cookie');
  check(externalCalls, 0, 'No sign-in provider, vendor, AI or real recipient was contacted');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, actualRequests: requests, externalCalls }));
} finally { globalThis.fetch = originalFetch; configure(); }
