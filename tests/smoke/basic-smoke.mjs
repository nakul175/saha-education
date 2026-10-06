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
  ['app/api/admin/profile-links/route.ts', 'GET'], ['app/api/admin/profile-links/history/route.ts', 'GET'],
  ['app/api/reading-imports/route.ts', 'GET'], ['app/api/reading-imports/[id]/route.ts', 'GET'], ['app/api/reading-imports/[id]/decision/route.ts', 'POST'],
  ['app/api/assignments/[id]/submission-window/route.ts', 'GET'], ['app/api/assignments/[id]/submission-window/history/route.ts', 'GET'],
  ['app/api/schools/route.ts', 'GET'], ['app/api/courses/route.ts', 'GET'], ['app/api/classes/route.ts', 'GET'],
  ['app/api/users/route.ts', 'GET'], ['app/api/report-cards/route.ts', 'GET'], ['app/api/notifications/route.ts', 'GET'],
  ['app/api/classes/[id]/attendance-summary/route.ts', 'GET'], ['app/api/classes/[id]/attendance-editor/route.ts', 'GET'],
  ['app/api/classes/[id]/attendance-editor/history/route.ts', 'GET'],
  ['app/api/assessments/[id]/result-editor/route.ts', 'GET'], ['app/api/assessments/[id]/result-editor/history/route.ts', 'GET'],
  ['app/api/registry/students/route.ts', 'POST'], ['app/api/registry/guardians/route.ts', 'POST'],
  ['app/api/registry/creations/[requestId]/route.ts', 'GET'],
];
const originalFetch = globalThis.fetch;
let externalCalls = 0;
globalThis.fetch = async () => { externalCalls++; throw new Error('Offline smoke must not contact any provider'); };
try {
  const tables = new Set(sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(row => row.name));
  for (const name of ['identity_admin_events', 'identity_admin_user_versions', 'curriculum_references', 'curriculum_reference_versions', 'resource_reference_bindings', 'submission_attempts', 'submission_feedback', 'reading_corrections', 'profile_link_versions', 'profile_link_events', 'reading_import_drafts', 'reading_import_items', 'reading_import_receipts', 'assignment_submission_windows']) check(tables.has(name), true, 'Migration boots ' + name);
  await seedSecurityData(db, schema);
  check(tables.has('report_publication_receipts'), true, 'Publication evidence migration boots');
  for (const name of ['attendance_reviews', 'attendance_review_entries']) check(tables.has(name), true, 'Reviewed attendance migration boots ' + name);
  for (const name of ['assessment_reviews', 'assessment_review_entries']) check(tables.has(name), true, 'Reviewed assessment migration boots ' + name);
  for (const name of ['registry_creation_receipts', 'demo_installations']) check(tables.has(name), true, 'Current registry/demo migration boots ' + name);
  const demo = await load('app/api/demo/route.ts');
  const demoStatus = await demo.GET();
  check(await demoStatus.json(), { available: false, synthetic: true }, 'Synthetic demo entry is disabled by default');
  check(demoStatus.headers.get('cache-control'), 'no-store', 'Demo availability response is uncached');
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
  const profiles = routes.get('app/api/admin/profile-links/route.ts');
  check((await profiles.GET(request('GET', 'teacher-a'))).status, 403, 'Teacher cannot list profile ownership');
  const inventory = await profiles.GET(request('GET', 'admin-a'));
  check(inventory.status, 200, 'Reviewed profile inventory boots');
  check((await inventory.json()).profiles.length, 4, 'Admin inventory is school-scoped');
  check((await profiles.POST(request('POST', 'admin-a', 'https://attacker.example.invalid'))).status, 403, 'Profile mutation origin fails closed');
  const imports = routes.get('app/api/reading-imports/route.ts');
  check((await imports.GET(request('GET', 'student-user-a'))).status, 403, 'Learner cannot list imports');
  const drafts = await imports.GET(request('GET', 'teacher-a'));
  check(drafts.status, 200, 'Reading import list boots');
  check(await drafts.json(), [], 'Fresh import list is empty');
  const windows = routes.get('app/api/assignments/[id]/submission-window/route.ts');
  check((await windows.GET(request('GET', 'teacher-a'), context)).status, 404, 'Missing window stays safely unavailable');
  check((await windows.POST(request('POST', 'student-user-a'), context)).status, 403, 'Learner window write denied before invalid body');
  check((await routes.get('app/api/assignments/[id]/submission-window/history/route.ts').GET(request('GET', 'student-user-a'), context)).status, 403, 'Staff window history denies learner');
  check((await routes.get('app/api/users/route.ts').GET(request('GET', 'teacher-a'))).status, 403, 'Account picker denies staff');
  check((await routes.get('app/api/report-cards/route.ts').POST(request('POST', 'guardian-a'))).status, 403, 'Report creation denies family before invalid body');
  const attendanceEditor = routes.get('app/api/classes/[id]/attendance-editor/route.ts');
  for (const user of ['guardian-a', 'student-user-a']) {
    check((await attendanceEditor.GET(request('GET', user), context)).status, 403, 'Family cannot read staff attendance editor before date validation');
    check((await attendanceEditor.POST(request('POST', user), context)).status, 403, 'Family cannot save reviewed attendance before body validation');
  }
  const editorContext = { params: Promise.resolve({ id: 'class-a' }) };
  const attendanceRequest = (path, method = 'GET', payload) => new Request(origin + path, { method,
    headers: { origin, cookie: sessions['teacher-a'], ...(payload ? { 'content-type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}) });
  check((await attendanceEditor.GET(attendanceRequest('/api/classes/class-a/attendance-editor?date=2026-02-30'), editorContext)).status, 400, 'Impossible calendar date is rejected');
  const marks = await attendanceEditor.GET(attendanceRequest('/api/classes/class-a/attendance-editor?date=2026-10-05'), editorContext);
  check(marks.status, 200, 'Staff attendance snapshot boots');
  check((await marks.json()).roster.items[0].record, null, 'Fresh mark is explicitly unrecorded');
  const reviewInput = { date: '2026-10-05', clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
    reason: 'Reviewed synthetic attendance boot check.', entries: [{ studentId: 'student-a', status: 'absent', note: 'Synthetic saved explanation', expectedRecord: null }] };
  const saved = await attendanceEditor.POST(attendanceRequest('/api/classes/class-a/attendance-editor', 'POST', reviewInput), editorContext);
  check(saved.status, 201, 'Reviewed attendance and evidence commit through actual route');
  const savedBody = await saved.json();
  check(savedBody.review.changes[0].afterRecord.status, 'absent', 'Explicit reviewed absence remains saved');
  check(sqlite.prepare('SELECT count(*) n FROM attendance_review_entries').get().n, 1, 'One immutable attendance change is recorded');
  const replay = await attendanceEditor.POST(attendanceRequest('/api/classes/class-a/attendance-editor', 'POST', reviewInput), editorContext);
  check(replay.status, 200, 'Exact attendance UUID retry boots');
  check((await replay.json()).review, savedBody.review, 'Retry returns original immutable review');
  const history = await routes.get('app/api/classes/[id]/attendance-editor/history/route.ts').GET(
    attendanceRequest('/api/classes/class-a/attendance-editor/history?date=2026-10-05'), editorContext);
  check(history.status, 200, 'Reviewed attendance history boots');
  check((await history.json()).total, 1, 'Retry creates no second review');
  const resultEditor = routes.get('app/api/assessments/[id]/result-editor/route.ts');
  for (const user of ['guardian-a', 'student-user-a']) {
    check((await resultEditor.GET(request('GET', user), context)).status, 403, 'Family cannot read private reviewed result editor');
    check((await resultEditor.POST(request('POST', user), context)).status, 403, 'Family reviewed result write denied before body validation');
  }
  const resultContext = { params: Promise.resolve({ id: 'assessment-a' }) };
  const resultSnapshot = await resultEditor.GET(attendanceRequest('/api/assessments/assessment-a/result-editor'), resultContext);
  check(resultSnapshot.status, 200, 'Current staff result snapshot boots');
  const resultBody = await resultSnapshot.json();
  check(resultBody.roster.items[0].record, null, 'Unrecorded score remains blank');
  const resultInput = { clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Reviewed synthetic zero-score boot check.',
    expectedAssessment: resultBody.assessment, entries: [{ studentId: 'student-a', score: 0, grade: null, feedback: '', expectedRecord: null }] };
  const resultSaved = await resultEditor.POST(attendanceRequest('/api/assessments/assessment-a/result-editor', 'POST', resultInput), resultContext);
  check(resultSaved.status, 201, 'Reviewed zero result commits through actual route');
  const resultReceipt = await resultSaved.json();
  check(resultReceipt.review.changes[0].afterRecord.score, 0, 'A saved zero is an explicit result');
  check(resultReceipt.review.changes[0].afterRecord.grade, null, 'Reviewed null grade stays null');
  check(resultReceipt.review.changes[0].afterRecord.feedback, '', 'Reviewed empty feedback stays distinct from null');
  const resultRetry = await resultEditor.POST(attendanceRequest('/api/assessments/assessment-a/result-editor', 'POST', resultInput), resultContext);
  check(resultRetry.status, 200, 'Committed reviewed result UUID retry boots');
  check((await resultRetry.json()).review, resultReceipt.review, 'Result retry returns original evidence');
  const resultHistory = await routes.get('app/api/assessments/[id]/result-editor/history/route.ts').GET(
    attendanceRequest('/api/assessments/assessment-a/result-editor/history'), resultContext);
  check(resultHistory.status, 200, 'Staff reviewed result history boots');
  check((await resultHistory.json()).total, 1, 'Result retry appends no duplicate review');
  const report = await load('app/api/report-cards/[id]/route.ts');
  const publication = await report.PATCH(new Request(origin + '/api/report-cards/draft-a', {
    method: 'PATCH', headers: { origin, cookie: sessions['admin-a'], 'content-type': 'application/json' }, body: JSON.stringify({ publish: true }),
  }), { params: Promise.resolve({ id: 'draft-a' }) });
  check(publication.status, 200, 'Report publication trigger boots through actual route');
  check(sqlite.prepare('SELECT count(*) n FROM report_publication_receipts WHERE report_id=?').get('draft-a').n, 1, 'Smoke publication saves one private receipt');
  check(sqlite.prepare('SELECT count(*) n FROM notifications WHERE id=?').get('report-card-published:draft-a:guardian-a').n, 1, 'Smoke publication saves one linked guardian in-app notice');
  const login = await load('app/api/auth/login/route.ts');
  check((await login.POST(request('POST'))).status, 503, 'Unconfigured provider login fails closed');
  check(externalCalls, 0, 'Smoke does not call a provider');
  console.log(`Education boot/access smoke: ${passed} checks passed (isolated migrated SQLite and synthetic sessions; no hosted deployment).`);
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
} catch (error) {
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0 }));
  throw error;
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
