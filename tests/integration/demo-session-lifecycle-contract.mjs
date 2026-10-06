// Synthetic demo role entry as a user journey (FR-01, FR-02, FR-04, NFR-01): role choice, entry, a working session,
// own-account summary, sign-out, expiry and renewal, a disabled demo account, wrong-origin refusal, rate limit and
// identity administration inside the isolated installation. Real route handlers and production SQL over isolated
// SQLite, fictional rows only, zero external requests.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, load } from '../support/security-db.mjs';

const { sqlite } = freshDatabase();
const demo = await load('app/api/demo/route.ts');
const sessionRoute = await load('app/api/session/route.ts');
const account = await load('app/api/account/route.ts');
const users = await load('app/api/users/route.ts');
const students = await load('app/api/students/route.ts');
const adminUsers = await load('app/api/admin/users/route.ts');
const adminUser = await load('app/api/admin/users/[id]/route.ts');
const adminRole = await load('app/api/admin/users/[id]/role/route.ts');
const adminIdentity = await load('app/api/admin/users/[id]/identity/route.ts');
const sessions = await load('lib/education/session.ts');
const policy = await load('lib/education/demo-policy.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
bindings.SAHA_DEMO_ENABLED = 'true';
bindings.SAHA_DEMO_INSTALLATION_ID = '4f3b2a10-8c1d-4e5f-9a6b-7c8d9e0f1a2b';
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
const count = (table, where = '1=1') => sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get().n;
let ip = 0;
const entryHeaders = (extra = {}) => ({ origin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.' + (++ip % 200) + '-' + Math.floor(ip / 200), ...extra });
async function enter(role, { cookie, suppliedOrigin, acknowledged = true, headers = {} } = {}) {
  const request = new Request(origin + '/api/demo', { method: 'POST',
    headers: entryHeaders({ ...(cookie ? { cookie } : {}), ...(suppliedOrigin ? { origin: suppliedOrigin } : {}), ...headers }),
    body: JSON.stringify({ role, syntheticAcknowledged: acknowledged }) });
  const response = await demo.POST(request);
  const setCookie = response.headers.get('set-cookie');
  return { response, cookie: setCookie?.split(';')[0] ?? null, setCookie };
}
const call = (handler, path, cookie, method = 'GET', extra = {}, context) => handler(new Request(origin + path, { method, headers: { origin, ...(cookie ? { cookie } : {}), ...extra } }), context);
const whoami = async cookie => { const response = await call(sessionRoute.GET, '/api/session', cookie); return { status: response.status, body: await response.json() }; };
const why = 'Reviewed fictional roster change in the demo';
const uuid = () => crypto.randomUUID();
const send = (handler, path, cookie, value, context) => handler(new Request(origin + path, { method: 'PATCH',
  headers: { origin, 'content-type': 'application/json', cookie }, body: JSON.stringify(value) }), context);
const idContext = id => ({ params: Promise.resolve({ id }) });
const originalFetch = globalThis.fetch; let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('The synthetic demo must not make external requests'); };
try {
  // ---- Role choice and entry -----------------------------------------------------------------------------------------------
  check(await (await demo.GET()).json(), { available: true, synthetic: true }, 'Demo availability is reported for the isolated installation');
  const cookies = {};
  const labels = { admin: 'Demo administrator', teacher: 'Demo teacher', guardian: 'Demo guardian', student: 'Demo learner' };
  for (const role of ['admin', 'teacher', 'guardian', 'student']) {
    const entered = await enter(role);
    check([entered.response.status, await entered.response.json()], [200, { destination: '/', synthetic: true }], 'Role entry succeeds: ' + role);
    check(/^__Host-saha_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800$/.test(entered.setCookie), true, 'Entry sets an opaque eight-hour host cookie: ' + role);
    cookies[role] = entered.cookie;
    check(await whoami(cookies[role]), { status: 200, body: { id: 'saha-demo-' + role, role, schoolId: 'saha-demo-school' } }, 'The session is that fixed fictional account: ' + role);
    const summary = await (await call(account.GET, '/api/account', cookies[role])).json();
    check({ name: summary.name, role: summary.role, schoolName: summary.schoolName, signInMethod: summary.signInMethod, email: summary.email },
      { name: labels[role], role, schoolName: 'River School — synthetic demo', signInMethod: 'synthetic_demo', email: `saha-demo-${role}@example.invalid` }, 'Account summary labels the session as synthetic: ' + role);
    const expiresIn = Date.parse(summary.sessionExpiresAt) - Date.now();
    check(expiresIn > 28700000 && expiresIn <= 28800000, true, 'Account summary shows the eight-hour expiry: ' + role);
    check(Object.keys(summary).sort(), ['email', 'name', 'role', 'schoolName', 'sessionExpiresAt', 'signInMethod'], 'Account summary exposes no issuer, subject, id or other account: ' + role);
  }
  check([(await call(account.GET, '/api/account', null)).status, (await call(account.GET, '/api/account', 'saha_demo_role=admin')).status], [401, 401], 'Account summary needs a real session; a role cookie confers nothing');
  check([count('users'), count('schools'), count('demo_installations'), count('auth_sessions')], [4, 1, 1, 4], 'One installation, school and four fixed accounts exist; one session per entry');
  const adminList = await (await call(users.GET, '/api/users', cookies.admin)).json();
  check(adminList.map(user => user.id).sort(), ['saha-demo-admin', 'saha-demo-guardian', 'saha-demo-student', 'saha-demo-teacher'], 'A working administrator session lists the four fictional accounts');
  check((await call(users.GET, '/api/users', cookies.teacher)).status, 403, 'A teacher session cannot list accounts');
  check([(await (await call(students.GET, '/api/students', cookies.guardian)).json()).length, (await (await call(students.GET, '/api/students', cookies.student)).json()).length], [2, 1], 'Family and learner sessions keep their scoped records');

  // ---- Refusals: choice, acknowledgement, origin --------------------------------------------------------------------------
  const sessionsBefore = count('auth_sessions');
  for (const [label, attempt, status] of [
    ['wrong origin', enter('teacher', { suppliedOrigin: 'https://attacker.example.invalid' }), 403],
    ['cross-site fetch', enter('teacher', { headers: { 'sec-fetch-site': 'cross-site' } }), 403],
    ['missing acknowledgement', enter('teacher', { acknowledged: false }), 400],
    ['unknown role', enter('owner'), 400],
  ]) {
    const refused = await attempt;
    check([refused.response.status, refused.setCookie, (await refused.response.json()).error !== undefined], [status, null, true], 'Entry refused without a cookie: ' + label);
  }
  const noOrigin = new Request(origin + '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'teacher', syntheticAcknowledged: true }) });
  check((await demo.POST(noOrigin)).status, 403, 'A request without an Origin is refused');
  const spoof = await demo.POST(new Request(origin + '/api/demo', { method: 'POST', headers: entryHeaders({ cookie: 'saha_demo_role=admin', 'x-saha-role': 'admin' }), body: JSON.stringify({ role: 'teacher', syntheticAcknowledged: true, userId: 'saha-demo-admin', schoolId: 'other' }) }));
  check(spoof.status, 400, 'Public identity data in the entry body is refused');
  check(count('auth_sessions'), sessionsBefore, 'Refused entries created no session');
  const crossOriginOut = await call(sessionRoute.DELETE, '/api/session', cookies.teacher, 'DELETE', { origin: 'https://attacker.example.invalid' });
  check([crossOriginOut.status, (await whoami(cookies.teacher)).status], [403, 200], 'A cross-origin sign-out is refused and leaves the session');
  const messages = {};
  messages.origin = (await (await enter('teacher', { suppliedOrigin: 'https://attacker.example.invalid' })).response.json()).error;
  check(messages.origin, 'Request origin is not allowed', 'The origin refusal keeps its stable message');

  // ---- Sign-out ----------------------------------------------------------------------------------------------------------------
  const signOut = await call(sessionRoute.DELETE, '/api/session', cookies.guardian, 'DELETE');
  check([signOut.status, (await signOut.json()).message, signOut.headers.getSetCookie().some(value => value.startsWith('__Host-saha_session=;') && value.includes('Max-Age=0'))], [200, 'Logged out', true], 'Sign-out clears the cookie');
  check([(await whoami(cookies.guardian)).status, (await call(account.GET, '/api/account', cookies.guardian)).status, (await call(students.GET, '/api/students', cookies.guardian)).status], [401, 401, 401], 'The signed-out session reaches nothing');
  check(count('auth_sessions', "user_id='saha-demo-guardian'"), 0, 'Sign-out deletes the session row');
  const again = await enter('guardian');
  cookies.guardian = again.cookie;
  check((await whoami(cookies.guardian)).body.id, 'saha-demo-guardian', 'A new entry after sign-out opens a working session');

  // ---- Expiry and renewal ------------------------------------------------------------------------------------------------------
  sqlite.prepare("UPDATE auth_sessions SET expires_at = ? WHERE user_id = 'saha-demo-student'").run(Date.now() - 1000);
  check([(await whoami(cookies.student)).status, (await call(account.GET, '/api/account', cookies.student)).status, (await call(students.GET, '/api/students', cookies.student)).status], [401, 401, 401], 'An expired session is refused everywhere');
  const expiredToken = cookies.student;
  const renewed = await enter('student', { cookie: cookies.student });
  cookies.student = renewed.cookie;
  check([renewed.response.status, cookies.student !== expiredToken, (await whoami(cookies.student)).body.id], [200, true, 'saha-demo-student'], 'Entering again renews the session with a new token');
  check([(await whoami(expiredToken)).status, count('auth_sessions', "user_id='saha-demo-student'")], [401, 1], 'The expired token stays dead and its row is cleaned');
  const switched = await enter('teacher', { cookie: cookies.student });
  check([(await whoami(cookies.student)).status, (await whoami(switched.cookie)).body.id], [401, 'saha-demo-teacher'], 'Switching role ends the previous session of this browser');
  cookies.teacher = switched.cookie;

  // ---- Disabled demo account ---------------------------------------------------------------------------------------------------------
  const detail = await (await call(adminUser.GET, '/api/admin/users/saha-demo-teacher', cookies.admin, 'GET', {}, { params: Promise.resolve({ id: 'saha-demo-teacher' }) })).json();
  check([detail.user.version, detail.classCount, detail.fixedDemoAccount, detail.demoRuntime], [0, 1, true, true], 'Administrator detail shows the fixed fictional teacher and its class');
  const disable = { clientRequestId: uuid(), expectedVersion: 0, enabled: false, reviewConfirmed: true, reason: why };
  let response = await send(adminUser.PATCH, '/api/admin/users/saha-demo-teacher', cookies.admin, disable, idContext('saha-demo-teacher'));
  check(response.status, 200, 'The demonstration administrator disables the fictional teacher');
  check([(await whoami(cookies.teacher)).status, (await call(account.GET, '/api/account', cookies.teacher)).status], [401, 401], 'The disabled account is signed out at once');
  const blocked = await enter('teacher');
  const blockedBody = await blocked.response.json();
  check([blocked.response.status, blocked.setCookie, blockedBody.error], [403, null, 'This demo account is unavailable'], 'A disabled demo account cannot be entered and is explained');
  check((await enter('student')).response.status, 200, 'Other demo roles are unaffected');
  response = await send(adminUser.PATCH, '/api/admin/users/saha-demo-teacher', cookies.admin, { clientRequestId: uuid(), expectedVersion: 1, enabled: true, reviewConfirmed: true, reason: why }, idContext('saha-demo-teacher'));
  check(response.status, 200, 'The administrator re-enables the fictional teacher');
  check((await whoami(cookies.teacher)).status, 401, 'Re-enabling never revives the old session');
  const back = await enter('teacher');
  check([back.response.status, (await whoami(back.cookie)).body.id], [200, 'saha-demo-teacher'], 'The teacher can enter again after re-enabling');
  cookies.teacher = back.cookie;
  const selfDisable = await send(adminUser.PATCH, '/api/admin/users/saha-demo-admin', cookies.admin, { ...disable, clientRequestId: uuid() }, idContext('saha-demo-admin'));
  check(selfDisable.status, 409, 'The only demonstration administrator cannot lock themselves out');

  // ---- Identity administration inside the isolated installation ------------------------------------------------------------------
  const provisionBody = (subject, extra = {}) => ({ clientRequestId: uuid(), name: 'Fictional colleague', email: subject + '@example.invalid', role: 'teacher', identityIssuer: policy.DEMO_ISSUER,
    identitySubject: subject, reviewConfirmed: true, reason: why, ...extra });
  const post = value => adminUsers.POST(new Request(origin + '/api/admin/users', { method: 'POST', headers: { origin, 'content-type': 'application/json', cookie: cookies.admin }, body: JSON.stringify(value) }));
  response = await post(provisionBody('fictional-colleague'));
  const colleague = await response.json();
  check([response.status, colleague.user.identityIssuer, colleague.user.schoolId], [201, policy.DEMO_ISSUER, 'saha-demo-school'], 'A fictional colleague is provisioned with the synthetic issuer in the demo school');
  response = await post(provisionBody('foreign-person', { identityIssuer: 'https://identity.example.invalid' }));
  check([response.status, (await response.json()).reason], [409, 'demo_issuer'], 'A real-looking issuer is refused because it would close the isolated installation');
  check((await whoami(cookies.admin)).status, 200, 'The demonstration still works after the refusal');
  response = await send(adminRole.PATCH, `/api/admin/users/${colleague.user.id}/role`, cookies.admin, { clientRequestId: uuid(), expectedVersion: 1, role: 'student', reviewConfirmed: true, reason: why }, idContext(colleague.user.id));
  check([response.status, (await response.json()).user.role], [200, 'student'], 'The fictional colleague can be reassigned');
  response = await send(adminIdentity.PATCH, `/api/admin/users/${colleague.user.id}/identity`, cookies.admin, { clientRequestId: uuid(), expectedVersion: 2, action: 'unlink', reviewConfirmed: true, reason: why }, idContext(colleague.user.id));
  check([response.status, (await response.json()).reason], [409, 'demo_unlink'], 'Unlinking is refused in the isolated installation because an unmapped account would close it');
  for (const [target, role, reason] of [['saha-demo-teacher', 'guardian', 'class_assigned'], ['saha-demo-guardian', 'teacher', 'profile_linked'], ['saha-demo-student', 'teacher', 'profile_linked']]) {
    response = await send(adminRole.PATCH, `/api/admin/users/${target}/role`, cookies.admin, { clientRequestId: uuid(), expectedVersion: sqlite.prepare('SELECT coalesce((SELECT version FROM identity_admin_user_versions WHERE user_id=?),0) AS v').get(target).v, role, reviewConfirmed: true, reason: why }, idContext(target));
    check([response.status, (await response.json()).reason], [409, reason], 'A fixed demonstration role keeps its role while its records depend on it: ' + target);
  }
  check([(await enter('admin')).response.status, (await enter('teacher')).response.status, (await enter('student')).response.status, (await enter('guardian')).response.status], [200, 200, 200, 200], 'Every fixed role can still enter after administration activity');
  check(sqlite.prepare("SELECT count(*) AS n FROM users WHERE identity_issuer IS NULL OR identity_issuer <> ?").get(policy.DEMO_ISSUER).n, 0, 'Every account keeps the synthetic issuer: isolation intact');

  // ---- Shared sign-in rate limit ---------------------------------------------------------------------------------------------------
  const crowd = '198.51.100.99'; const statuses = [];
  for (let attempt = 0; attempt < 41; attempt++) statuses.push((await demo.POST(new Request(origin + '/api/demo', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': crowd }, body: JSON.stringify({ role: 'student', syntheticAcknowledged: true }) }))).status);
  check([statuses.slice(0, 40).every(status => status === 200), statuses[40]], [true, 429], 'The forty-first entry in a window is limited');
  const limited = await demo.POST(new Request(origin + '/api/demo', { method: 'POST', headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': crowd }, body: JSON.stringify({ role: 'student', syntheticAcknowledged: true }) }));
  check([limited.status, limited.headers.get('set-cookie'), (await limited.json()).error], [429, null, 'Too many demo sign-ins; try again later'], 'The limit refuses without a cookie and with its stable message');

  // ---- Demo off: the journey closes -----------------------------------------------------------------------------------------------------
  const valid = (await enter('admin')).cookie;
  bindings.SAHA_DEMO_ENABLED = 'false';
  const closed = await enter('admin');
  const closedBody = await closed.response.json();
  check([closed.response.status, closed.setCookie, closedBody.error], [404, null, 'Demo unavailable'], 'Entry is closed when the demo is switched off');
  check([(await whoami(valid)).status, (await call(account.GET, '/api/account', valid)).status, await (await demo.GET()).json()], [401, 401, { available: false, synthetic: true }], 'Switching the demo off also closes existing sessions');
  bindings.SAHA_DEMO_ENABLED = 'true';
  check(networkCalls, 0, 'No provider, network or recipient request was made');
  void sessions;
  console.log(`Synthetic demo session lifecycle: ${checks} checks passed (fixed fictional roles, actual sessions, production SQL over isolated SQLite; no provider).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, externalRequests: networkCalls }));
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
