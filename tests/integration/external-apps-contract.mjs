import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const registry = await load('app/api/external-apps/route.ts');
const launch = await load('app/api/external-apps/[id]/launch/route.ts');
const base = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = base;
bindings.SAHA_ORF_APP_URL = '';
const sessions = {};
for (const id of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
  sessions[id] = (await createSession(id)).split(';')[0];
}
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function request(role, method = 'GET', payload, origin = base) {
  const headers = { origin };
  if (role) headers.cookie = sessions[role];
  const init = { method, headers };
  if (payload !== undefined) { init.body = JSON.stringify(payload); headers['content-type'] = 'application/json'; }
  return new Request(base + '/api/external-apps/oral-reading-fluency/launch', init);
}
const params = id => ({ params: Promise.resolve({ id }) });
async function post(role = 'admin-a', payload, id = 'oral-reading-fluency', origin = base) {
  return launch.POST(request(role, 'POST', payload, origin), params(id));
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('External network must never be contacted'); };
try {
  check((await registry.GET(request(null))).status, 401, 'Registry requires a real session');
  check((await post(null)).status, 401, 'Launch requires a real session');
  const demo = new Request(base + '/api/external-apps', {headers: {cookie: 'saha_demo_role=admin'}});
  check((await registry.GET(demo)).status, 401, 'Role cookies confer no access');
  let response = await registry.GET(request('admin-a'));
  check(response.status, 200, 'Staff can inspect disabled metadata');
  check(response.headers.get('cache-control'), 'no-store', 'Registry is uncached');
  const metadata = await response.json();
  check(metadata, [{id: 'oral-reading-fluency', title: 'Oral reading fluency', available: false,
    allowedRoles: ['admin', 'teacher'], capability: 'launch-only', signIn: 'separate', resultSync: false}], 'Accurate launch-only metadata without a destination');
  check((await post()).status, 503, 'Unconfigured launch fails closed');
  check((await post('admin-a', {}, 'unknown-app')).status, 404, 'Unknown application is unavailable');
  for (const role of ['guardian-a', 'student-user-a']) {
    check((await post(role)).status, 403, 'Families cannot launch');
  }
  bindings.SAHA_ORF_APP_URL = 'https://orf.example.invalid/reading';
  for (const role of ['admin-a', 'teacher-a']) {
    response = await post(role);
    check(response.status, 200, 'Authorized staff launch');
    check(await response.json(), {url: bindings.SAHA_ORF_APP_URL, signIn: 'separate', resultSync: false}, 'Only configured URL is returned');
    check(response.headers.get('cache-control'), 'no-store', 'Launch destination is uncached');
  }
  for (const role of ['guardian-a', 'student-user-a']) {
    const familyMetadata = await (await registry.GET(request(role))).json();
    check(familyMetadata[0].available, false, 'A configured slot still excludes family roles');
    check(Object.hasOwn(familyMetadata[0], 'url'), false, 'Registry never reveals destination');
  }
  check((await post('admin-a', {}, 'oral-reading-fluency', 'https://other.example.invalid')).status, 403, 'Cross-origin launch rejected');
  const noOrigin = request('admin-a', 'POST'); noOrigin.headers.delete('origin');
  check((await launch.POST(noOrigin, params('oral-reading-fluency'))).status, 403, 'Missing-origin launch rejected');
  check((await post('teacher-a', {studentId: 'student-a'})).status, 200, 'Teacher may launch in assigned student context');
  check((await post('teacher-a', {studentId: 'student-other'})).status, 404, 'Teacher cannot select unassigned student');
  check((await post('admin-a', {studentId: 'student-b'})).status, 404, 'Cross-school student context rejected');
  check((await post('admin-a', {studentId: 'missing-student'})).status, 404, 'Unknown student context rejected');
  response = await post('admin-a', {studentId: 'student-a'});
  check(await response.json(), {url: bindings.SAHA_ORF_APP_URL, signIn: 'separate', resultSync: false}, 'Student context is never forwarded');
  for (const payload of [{url:'https://attacker.example.invalid'}, {token:'secret'}, {studentId:''}, {studentId:9}, {audio:'private'}, {studentName:'private'}]) {
    check((await post('admin-a', payload)).status, 400, 'Unknown launch parameters rejected');
  }
  const malformed = request('admin-a', 'POST');
  const malformedBody = new Request(malformed, {body:'{invalid'});
  check((await launch.POST(malformedBody, params('oral-reading-fluency'))).status, 400, 'Malformed JSON rejected');
  for (const value of ['http://orf.example.invalid', 'https://user:password@orf.example.invalid', 'https://orf.example.invalid?token=secret',
    'https://orf.example.invalid#private', 'https://orf.example.invalid?', 'https://orf.example.invalid#', 'javascript:alert(1)',
    '/relative', 'not a URL', 'https://orf.example.invalid\\private', 'https://orf.example.invalid/with space']) {
    bindings.SAHA_ORF_APP_URL = value;
    const invalidMetadata = await (await registry.GET(request('admin-a'))).json();
    check(invalidMetadata[0].available, false, 'Unsafe configuration disables slot');
    response = await post();
    check(response.status, 503, 'Unsafe configuration cannot launch');
    check(await response.json(), {error:'Service unavailable'}, 'Configuration details remain private');
  }
  bindings.SAHA_ORF_APP_URL = 'https://orf.example.invalid/reading';
  sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run('2026-10-05T00:00:00.000Z', 'teacher-a');
  check((await post('teacher-a')).status, 401, 'Disabling user revokes app launch access');
  check(networkCalls, 0, 'Registry and launch make no external network calls');
  check(sqlite.prepare('SELECT COUNT(*) AS count FROM notifications').get().count, 3, 'Launch leaves education records unchanged');
  console.log(`External app launch contract: ${checks} checks passed (actual sessions/services against isolated SQLite; no external service invoked).`);
  console.log(JSON.stringify({passed: checks, failed: 0, skipped: 0}));
} finally {
  globalThis.fetch = originalFetch;
  sqlite.close();
}
