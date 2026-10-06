import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession, principalForToken } = await load('lib/education/session.ts');
const service = await load('lib/education/identity-admin.ts');
const collection = await load('app/api/admin/users/route.ts');
const detail = await load('app/api/admin/users/[id]/route.ts');
const events = await load('app/api/admin/users/events/route.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'guardian-a', 'student-user-a']) sessions[id] = (await createSession(id)).split(';')[0];
const input = {
  clientRequestId: crypto.randomUUID(), name: 'Reviewed synthetic teacher', email: 'provisioned-teacher@example.invalid', role: 'teacher',
  identityIssuer: 'https://identity.example.invalid', identitySubject: 'reviewed-synthetic-subject',
  reviewConfirmed: true, reason: 'Reviewed synthetic identity against approved school roster',
};
const change = { clientRequestId: crypto.randomUUID(), expectedVersion: 1, enabled: false, reviewConfirmed: true, reason: 'Reviewed synthetic access disable request' };
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
async function rejects(action, pattern, message) { await assert.rejects(action, pattern, message); checks++; }
function request(actor, method = 'GET', value, suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin };
  if (actor) headers.cookie = sessions[actor];
  const init = { method, headers };
  if (value !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(value); }
  return new Request(origin + '/api/admin/users', init);
}
async function status(actor, userId, value, suppliedOrigin) {
  return detail.PATCH(request(actor, 'PATCH', value, suppliedOrigin), { params: Promise.resolve({ id: userId }) });
}
function count(table) { return sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n; }
const originalFetch = globalThis.fetch; let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Administration must not activate or contact a provider'); };
try {
  for (const method of ['GET', 'POST']) check((await collection[method](request(null, method, method === 'POST' ? input : undefined))).status, 401, 'Anonymous identity administration is denied');
  check((await events.GET(request(null))).status, 401, 'Anonymous audit history is denied');
  check((await status(null, 'teacher-a', change)).status, 401, 'Anonymous account disable is denied');
  check((await collection.GET(new Request(origin + '/api/admin/users', { headers: { cookie: 'saha_demo_role=admin', 'x-saha-role': 'admin', 'x-saha-user-id': 'admin-a' } }))).status, 401, 'Public role and user spoofing cannot administer identities');
  for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) {
    check((await collection.GET(request(actor))).status, 403, 'Only school administrators list identity mappings');
    check((await collection.POST(request(actor, 'POST', input))).status, 403, 'Other roles cannot provision');
    check((await status(actor, 'teacher-a', change)).status, 403, 'Other roles cannot change enabled state');
    check((await events.GET(request(actor))).status, 403, 'Other roles cannot read administration evidence');
    const malformed = request(actor, 'POST', input); malformed.headers.set('content-type', 'text/plain');
    check((await collection.POST(malformed)).status, 403, 'Role authorization precedes body parsing');
  }
  check((await collection.POST(request('admin-a', 'POST', input, 'https://attacker.example.invalid'))).status, 403, 'Cross-origin provisioning is denied');
  const missingOrigin = request('admin-a', 'POST', input); missingOrigin.headers.delete('origin');
  check((await collection.POST(missingOrigin)).status, 403, 'Origin is required');
  check((await status('admin-a', 'teacher-b', { ...change, expectedVersion: 0 })).status, 404, 'Foreign-school target is hidden');
  check((await status('admin-a', 'missing-user', { ...change, expectedVersion: 0 })).status, 404, 'Missing target is hidden');
  check((await status('admin-a', 'admin-a', { ...change, expectedVersion: 0 })).status, 409, 'Administrator cannot lock themselves out');
  check(count('identity_admin_events'), 0, 'Denied mutations create no audit evidence');
  const own = await (await collection.GET(request('admin-a'))).json();
  check(own.every(user => user.schoolId === 'a'), true, 'Administrative inventory is school scoped');
  check(own.find(user => user.id === 'teacher-a').version, 0, 'Legacy users retain revision zero without remapping');
  check(own.find(user => user.id === 'teacher-a').identitySubject, 'sub-teacher-a', 'Existing explicit identity mappings are preserved');
  const foreign = await (await collection.GET(request('admin-b'))).json();
  check(foreign.every(user => user.schoolId === 'b'), true, 'Other administrator inventory is isolated');

  let response = await collection.POST(request('admin-a', 'POST', input));
  check(response.status, 201, 'Administrator provisions an explicitly reviewed identity');
  check(response.headers.get('cache-control'), 'no-store', 'Identity result is uncached');
  const created = await response.json(); const userId = created.user.id;
  check(created.user.schoolId, 'a', 'Provisioned school comes from actor');
  check(created.user.role, 'teacher', 'Explicit reviewed role is provisioned');
  check(created.user.identityIssuer, input.identityIssuer, 'Exact issuer is retained');
  check(created.user.identitySubject, input.identitySubject, 'Exact subject is retained');
  check(created.user.version, 1, 'Provisioning creates initial account revision');
  check(created.user.disabledAt, null, 'Reviewed new account is enabled');
  check(created.event.actorId, 'admin-a', 'Evidence actor is server identity');
  check(created.event.userId, userId, 'Evidence identifies the preserved account');
  check(created.event.action, 'provision', 'Evidence records provisioning');
  check(created.event.reason, input.reason, 'Evidence retains attributable reviewed reason');
  check(created.event.previousEnabled, null, 'Provisioning has no invented prior status');
  check(created.event.nextEnabled, true, 'Provisioning records resulting enabled status');
  check(Object.hasOwn(created.event, 'requestHash'), false, 'Request fingerprint stays private');
  check(Object.hasOwn(created.event, 'attemptId'), false, 'Attempt marker stays private');
  check(Number.isFinite(Date.parse(created.event.reviewedAt)), true, 'Review timestamp is server generated');
  check(count('identity_admin_events'), 1, 'Provisioning appends one attributable event');
  check((await principalForToken(null)), null, 'Provisioning creates no automatic session');
  response = await collection.POST(request('admin-a', 'POST', input));
  check(response.status, 201, 'Exact provisioning replay succeeds');
  check(await response.json(), created, 'Replay preserves account and original event');
  check(count('identity_admin_events'), 1, 'Replay adds no audit duplicates');
  check((await collection.POST(request('admin-a', 'POST', { ...input, name: 'Changed replay' }))).status, 409, 'Changed replay cannot rewrite identity');
  check((await collection.POST(request('admin-b', 'POST', input))).status, 409, 'Foreign-school retry UUID cannot claim successful operation');
  check((await collection.POST(request('admin-a', 'POST', { ...input, clientRequestId: crypto.randomUUID(), email: 'another@example.invalid' }))).status, 409, 'Duplicate issuer subject is denied rather than email linked');
  check((await collection.POST(request('admin-a', 'POST', { ...input, clientRequestId: crypto.randomUUID(), identitySubject: 'different-subject' }))).status, 409, 'Duplicate email cannot remap an existing identity');
  check(count('identity_admin_events'), 1, 'Duplicate attempts do not append false successful evidence');

  const invalidProvision = [
    { schoolId: 'b' }, { actorId: 'admin-b' }, { id: 'chosen-id' }, { disabledAt: 'yesterday' }, { version: 99 }, { createdAt: 'yesterday' },
    { role: 'owner' }, { role: 'teacher,admin' }, { name: '' }, { name: 'x'.repeat(121) }, { email: 'invalid' },
    { identityIssuer: 'http://identity.example.invalid' }, { identityIssuer: 'https://x:secret@identity.example.invalid' },
    { identityIssuer: 'https://identity.example.invalid?tenant=other' }, { identityIssuer: 'https://identity.example.invalid#subject' },
    { identityIssuer: ' https://identity.example.invalid' }, { identitySubject: '' }, { identitySubject: 'x'.repeat(256) },
    { identitySubject: 'with\ncontrol' }, { identitySubject: ' spaced ' }, { reviewConfirmed: false }, { reviewConfirmed: undefined },
    { reason: 'short' }, { reason: 'x'.repeat(501) }, { reason: 'private\nreason text' }, { clientRequestId: 'invalid' },
  ];
  const beforeUsers = count('users');
  for (const altered of invalidProvision) check((await collection.POST(request('admin-a', 'POST', { ...input, clientRequestId: crypto.randomUUID(), ...altered }))).status, 400, 'Invalid or spoofed provision fields fail closed');
  check(count('users'), beforeUsers, 'Invalid provisioning inserts no accounts');
  check(count('identity_admin_events'), 1, 'Invalid provisioning appends no evidence');
  const oversized = new Request(origin + '/api/admin/users', { method: 'POST', headers: { origin, cookie: sessions['admin-a'], 'content-type': 'application/json' }, body: JSON.stringify({ ...input, reason: 'x'.repeat(140000) }) });
  check((await collection.POST(oversized)).status, 400, 'Oversized streamed JSON is rejected');
  const malformed = new Request(origin + '/api/admin/users', { method: 'POST', headers: { origin, cookie: sessions['admin-a'], 'content-type': 'application/json' }, body: '{' });
  check((await collection.POST(malformed)).status, 400, 'Malformed JSON leaves no records');

  sessions.provisioned = (await createSession(userId)).split(';')[0];
  const secondCookie = (await createSession(userId)).split(';')[0];
  check(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(userId).n, 2, 'Synthetic user has two real sessions');
  response = await status('admin-a', userId, change);
  check(response.status, 200, 'Reviewed disable succeeds');
  const disabled = await response.json();
  check(disabled.user.version, 2, 'Disable increments optimistic revision');
  check(disabled.event.expectedVersion, 1, 'Evidence records supplied revision');
  check(disabled.event.resultingVersion, 2, 'Evidence records resulting revision');
  check(disabled.event.previousEnabled, true, 'Evidence records previous enabled state');
  check(disabled.event.nextEnabled, false, 'Evidence records disabled result');
  check(disabled.user.disabledAt, disabled.event.reviewedAt, 'Disable status and evidence share server timestamp');
  check(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(userId).n, 0, 'Disable revokes every target session atomically');
  check(await principalForToken(sessions.provisioned.split('=')[1]), null, 'First revoked session cannot authenticate');
  check(await principalForToken(secondCookie.split('=')[1]), null, 'Second revoked session cannot authenticate');
  check((await collection.GET(request('provisioned'))).status, 401, 'Disabled user cannot use a saved session');
  response = await status('admin-a', userId, change);
  check(response.status, 200, 'Exact disable replay succeeds');
  check(await response.json(), disabled, 'Replay preserves original review metadata');
  check(count('identity_admin_events'), 2, 'Disable replay inserts no duplicate evidence');
  check((await status('admin-a', userId, { ...change, enabled: true })).status, 409, 'Retry UUID cannot reverse its original action');
  check((await status('admin-a', userId, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 1, enabled: true })).status, 409, 'Stale status change conflicts');
  const enableInput = { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 2, enabled: true, reason: 'Reviewed synthetic access restoration request' };
  const enabled = await (await status('admin-a', userId, enableInput)).json();
  check(enabled.user.version, 3, 'Enable increments revision');
  check(enabled.user.disabledAt, null, 'Explicit reviewed enable restores account state');
  check(enabled.event.previousEnabled, false, 'Restoration preserves previous disabled state');
  check(sqlite.prepare('SELECT count(*) AS n FROM auth_sessions WHERE user_id=?').get(userId).n, 0, 'Enabling never resurrects revoked sessions');
  response = await status('admin-a', userId, change);
  check(response.status, 200, 'Original operation can be safely retried after subsequent changes');
  check((await response.json()).user.disabledAt, null, 'Old disable replay cannot reapply its old decision');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(userId).version, 3, 'Old replay cannot rewind revision');
  for (const altered of [{ schoolId: 'b' }, { role: 'admin' }, { identitySubject: 'new' }, { email: 'changed@example.invalid' }, { userId: 'teacher-b' }, { enabled: 'false' }, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { reviewConfirmed: false }, { reason: 'short' }]) {
    check((await status('admin-a', userId, { ...enableInput, clientRequestId: crypto.randomUUID(), expectedVersion: 3, ...altered })).status, 400, 'Status endpoint cannot edit mappings or accept invalid review');
  }

  const sameId = crypto.randomUUID(); const sameInput = { ...input, clientRequestId: sameId, email: 'concurrent@example.invalid', identitySubject: 'concurrent-subject' };
  const simultaneous = await Promise.all([collection.POST(request('admin-a', 'POST', sameInput)), collection.POST(request('admin-a', 'POST', sameInput))]);
  check(simultaneous.map(result => result.status), [201, 201], 'Concurrent identical provision retries both succeed');
  const simultaneousResults = await Promise.all(simultaneous.map(result => result.json()));
  check(simultaneousResults[0], simultaneousResults[1], 'Concurrent retry returns one preserved identity and event');
  check(sqlite.prepare('SELECT count(*) AS n FROM users WHERE identity_subject=?').get('concurrent-subject').n, 1, 'Concurrent create inserts one identity');
  const races = await Promise.all([
    status('admin-a', userId, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 3 }),
    status('admin-a', userId, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 3, enabled: true }),
  ]);
  check(races.map(result => result.status).sort(), [200, 409], 'Concurrent status updates have exactly one revision winner');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(userId).version, 4, 'Race increments revision exactly once');

  const originalBatch = db.batch.bind(db);
  const eventBeforeRace = count('identity_admin_events'); const userBeforeRace = count('users');
  db.batch = async queries => { sqlite.prepare("UPDATE users SET disabled_at='revoked-during-request' WHERE id='admin-a'").run(); return originalBatch(queries); };
  const revoked = { ...input, clientRequestId: crypto.randomUUID(), email: 'revoked-authority@example.invalid', identitySubject: 'revoked-authority-subject' };
  check((await collection.POST(request('admin-a', 'POST', revoked))).status, 403, 'Mutation rechecks live actor after request authentication');
  check(count('users'), userBeforeRace, 'Revoked actor inserts no user');
  check(count('identity_admin_events'), eventBeforeRace, 'Revoked actor appends no false successful event');
  db.batch = originalBatch; sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='admin-a'").run();
  await rejects(() => service.provisionIdentity({ id: 'teacher-a', role: 'admin', schoolId: 'a' }, revoked), /Administrator access required/, 'Forged service principal cannot substitute for current database role');

  // A failed database mutation must roll back event/version/session changes together.
  const guardId = simultaneousResults[0].user.id;
  const guardCookie = (await createSession(guardId)).split(';')[0];
  sqlite.exec(`CREATE TRIGGER identity_test_failure BEFORE UPDATE OF disabled_at ON users WHEN NEW.id='${guardId}' BEGIN SELECT RAISE(ABORT, 'synthetic transaction failure'); END;`);
  const beforeFailure = count('identity_admin_events');
  check((await status('admin-a', guardId, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 1 })).status, 500, 'Database failure is safely reported');
  check(count('identity_admin_events'), beforeFailure, 'Failed mutation rolls back its administration event');
  check(sqlite.prepare('SELECT disabled_at FROM users WHERE id=?').get(guardId).disabled_at, null, 'Failed mutation leaves enabled status intact');
  check(sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(guardId).version, 1, 'Failed mutation leaves revision intact');
  check((await principalForToken(guardCookie.split('=')[1])).id, guardId, 'Failed mutation preserves existing valid sessions');
  sqlite.exec('DROP TRIGGER identity_test_failure');

  const adminInput = { ...input, clientRequestId: crypto.randomUUID(), email: 'second-admin@example.invalid', identitySubject: 'second-admin-subject', role: 'admin' };
  const secondAdmin = await (await collection.POST(request('admin-a', 'POST', adminInput))).json();
  sessions.secondAdmin = (await createSession(secondAdmin.user.id)).split(';')[0];
  const adminRace = await Promise.all([
    status('admin-a', secondAdmin.user.id, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 1 }),
    status('secondAdmin', 'admin-a', { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 0 }),
  ]);
  check(adminRace.filter(result => result.status === 200).length, 1, 'Mutual admin-disable race permits only one live authority winner');
  check(adminRace.filter(result => [401, 403, 409].includes(result.status)).length, 1, 'Losing revoked administrator cannot complete competing write');
  check(sqlite.prepare("SELECT count(*) AS n FROM users WHERE school_id='a' AND role='admin' AND disabled_at IS NULL").get().n, 1, 'An enabled school administrator survives concurrent disable attempts');
  const survivingId = sqlite.prepare("SELECT id FROM users WHERE school_id='a' AND role='admin' AND disabled_at IS NULL").get().id;
  const survivingActor = survivingId === 'admin-a' ? 'admin-a' : 'secondAdmin';
  const survivingVersion = sqlite.prepare('SELECT version FROM identity_admin_user_versions WHERE user_id=?').get(survivingId)?.version ?? 0;
  check((await status(survivingActor, survivingId, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: survivingVersion })).status, 409, 'Last administrator cannot disable their own access');
  const history = await (await events.GET(request(survivingActor))).json();
  check(history.every(event => event.schoolId === 'a'), true, 'Administration evidence remains school scoped');
  check(history.some(event => event.action === 'disable'), true, 'History includes reviewed access changes');
  check(JSON.stringify(history).includes(input.identitySubject), false, 'Audit list does not duplicate provider subject');
  check(await (await events.GET(request('admin-b'))).json(), [], 'Foreign school cannot read other school events');
  check(sqlite.prepare("SELECT user_id FROM students WHERE id='student-a'").get().user_id, 'student-user-a', 'Account administration never remaps student profile ownership');
  check(sqlite.prepare("SELECT user_id FROM guardians WHERE id='guardian-profile-a'").get().user_id, 'guardian-a', 'Account administration never remaps guardian profile ownership');

  // Exercise the production Drizzle D1 driver, including its prepared-statement
  // batch path, against the same real isolated SQLite database.
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  function prepared(query, params = []) {
    return {
      bind(...values) { return prepared(query, values); },
      async run() { const result = sqlite.prepare(query).run(...params); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
      async all() { return { success: true, results: sqlite.prepare(query).all(...params), meta: {} }; },
      async raw() { const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...params); },
    };
  }
  const d1Client = {
    prepare: prepared,
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  globalThis.__sahaTestDb = d1Drizzle(d1Client, { schema });
  const nativeInput = { ...input, clientRequestId: crypto.randomUUID(), email: 'native-d1-driver@example.invalid', identitySubject: 'native-d1-subject' };
  response = await collection.POST(request(survivingActor, 'POST', nativeInput));
  check(response.status, 201, 'Production D1 prepared-statement batch provisions the reviewed identity');
  const native = await response.json();
  check(native.user.version, 1, 'D1 driver preserves first administration revision');
  check(native.event.actorId, survivingId, 'D1 driver preserves actor attribution');
  const nativeCookie = (await createSession(native.user.id)).split(';')[0];
  response = await status(survivingActor, native.user.id, { ...change, clientRequestId: crypto.randomUUID(), expectedVersion: 1 });
  check(response.status, 200, 'Production D1 batch disables reviewed identity');
  check((await response.json()).user.version, 2, 'D1 driver increments the persisted revision');
  check(await principalForToken(nativeCookie.split('=')[1]), null, 'D1-driver disable revokes its real session');
  check(sqlite.prepare('SELECT count(*) AS n FROM identity_admin_events WHERE user_id=?').get(native.user.id).n, 2, 'D1-driver operations append exactly two immutable events');
  check(networkCalls, 0, 'Account administration performs no provider requests');
  console.log(`Reviewed identity administration: ${checks} checks passed (actual sessions, atomic SQLite and production D1 prepared-batch driver; synthetic identities only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
