// Executed offline smoke: real route imports, migrated SQLite and synthetic sessions.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
let passed = 0;
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); passed++; };
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const context = { params: Promise.resolve({ id: 'missing', submissionId: 'missing' }) };
const paths = [
  ['app/api/admin/users/route.ts', 'GET'], ['app/api/admin/users/[id]/route.ts', 'PATCH'], ['app/api/admin/users/events/route.ts', 'GET'],
  ['app/api/curriculum/route.ts', 'GET'], ['app/api/curriculum/[id]/route.ts', 'GET'], ['app/api/curriculum/[id]/versions/route.ts', 'GET'],
  ['app/api/curriculum/[id]/approve/route.ts', 'POST'], ['app/api/curriculum/[id]/snapshot/route.ts', 'GET'], ['app/api/curriculum/[id]/draft/route.ts', 'POST'],
  ['app/api/assignments/[id]/submissions/route.ts', 'GET'], ['app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts', 'GET'],
  ['app/api/reading-review/route.ts', 'GET'], ['app/api/reading-checks/[id]/corrections/route.ts', 'GET'],
];
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('Offline smoke must not contact any provider'); };
try {
  const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
  for (const name of ['identity_admin_events', 'identity_admin_user_versions', 'curriculum_references', 'curriculum_reference_versions', 'resource_reference_bindings', 'submission_attempts', 'submission_feedback', 'reading_corrections']) check(tables.has(name), true, 'Migration boots ' + name);
  await seedSecurityData(db, schema);
  const { createSession } = await load('lib/education/session.ts');
  const sessions = {};
  for (const user of ['admin-a', 'teacher-a', 'student-user-a', 'guardian-a']) sessions[user] = (await createSession(user)).split(';')[0];
  const request = (method = 'GET', user, suppliedOrigin = origin) => new Request(origin + '/api/smoke', { method, headers: { origin: suppliedOrigin, ...(user ? { cookie: sessions[user] } : {}) }, ...(method !== 'GET' ? { body: '{}' } : {}) });
  const routes = new Map();
  for (const [path, method] of paths) {
    const route = await load(path); routes.set(path, route);
    check(typeof route[method], 'function', 'Route imports ' + path);
    const response = await route[method](request(method), context);
    check(response.status, 401, 'Anonymous route denied ' + path);
    check(response.headers.get('cache-control'), 'no-store', 'Anonymous result remains uncached');
  }
  const accounts = routes.get('app/api/admin/users/route.ts');
  check((await accounts.GET(request('GET', 'teacher-a'))).status, 403, 'Teacher cannot administer accounts');
  check((await accounts.GET(request('GET', 'admin-a'))).status, 200, 'Admin account list boots');
  check((await accounts.POST(request('POST', 'admin-a', 'https://attacker.example.invalid'))).status, 403, 'Mutation origin fails closed');
  const curriculum = routes.get('app/api/curriculum/route.ts');
  check((await curriculum.GET(request('GET', 'student-user-a'))).status, 403, 'Student cannot read staff references');
  const list = await curriculum.GET(request('GET', 'teacher-a'));
  check(list.status, 200, 'Teacher reference list boots');
  check(await list.json(), [], 'Fresh curriculum is an empty library');
  const review = routes.get('app/api/reading-review/route.ts');
  check((await review.GET(request('GET', 'guardian-a'))).status, 403, 'Guardian cannot read private reading review');
  const login = await load('app/api/auth/login/route.ts');
  check((await login.POST(request('POST'))).status, 503, 'Unconfigured provider login fails closed');
  check(externalCalls, 0, 'Smoke does not call a provider');
  console.log(`Education boot/access smoke: ${passed} checks passed (isolated migrated SQLite and synthetic sessions; no hosted deployment).`);
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
} catch (error) {
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0 }));
  throw error;
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
