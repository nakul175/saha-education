// Independent real synthetic opaque sessions/routes and production Drizzle D1
// over SQLite. Baseline unsafe diagnostics are separate; no browser evidence.
import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/d1';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from '../support/security-db.mjs';
const sessions = await load('lib/education/session.ts');
const auth = await load('lib/education/auth.ts');
const dashboards = await load('lib/education/dashboard.ts');
const resources = await load('lib/education/resources.ts');
const curriculum = await load('lib/education/curriculum.ts');
const readings = await load('lib/education/reading-checks.ts');
const imports = await load('lib/education/reading-imports.ts');
const submissions = await load('lib/education/submissions.ts');
const attendanceReview = await load('lib/education/attendance-reviews.ts');
const assessmentReview = await load('lib/education/assessment-reviews.ts');
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const routePaths = {
  students: 'students', guardians: 'guardians', classes: 'classes', courses: 'courses', attendance: 'attendance',
  assessments: 'assessments', reports: 'report-cards', notices: 'notifications', users: 'admin/users', profileLinks: 'admin/profile-links',
  attendanceEditor: 'classes/[id]/attendance-editor', assessmentEditor: 'assessments/[id]/result-editor',
  resources: 'resources', curriculum: 'curriculum', readings: 'reading-checks', imports: 'reading-imports', assignments: 'resource-assignments',
};
const routes = {}; for (const [name, path] of Object.entries(routePaths)) routes[name] = await load('app/api/' + path + '/route.ts');
const submissionRoute = await load('app/api/assignments/[id]/submissions/route.ts');
const feedbackRoute = await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts');
const originFetch = globalThis.fetch; let externalRequests = 0, requests = 0, checks = 0, scenarios = 0;
globalThis.fetch = async () => { externalRequests++; throw new Error('Session authority contracts must remain local and synthetic'); };
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const okay = (actual, message) => { assert.ok(actual, message); checks++; };
const roles = ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a'];
const content = { title: 'PRIVATE_SESSION_RESOURCE', type: 'worksheet', curriculum: 'Synthetic curriculum', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Synthetic evidence', body: 'PRIVATE_SESSION_RESOURCE_BODY', teacherNotes: 'PRIVATE_SESSION_TEACHER_NOTES', answerKey: 'PRIVATE_SESSION_ANSWER' };
const principal = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
async function scenario(name, action) {
  const f = freshDatabase(); await seedSecurityData(f.db, f.schema);
  const resource = await resources.createResource(principal, { content, clientResourceId: crypto.randomUUID() });
  await resources.approveResource(principal, resource.id, resource.latest.id);
  const assignment = await resources.assignResource(principal, resource.id, { classId: 'class-a', versionId: resource.latest.id });
  const source = await curriculum.createCurriculumReference(principal, { clientReferenceId: crypto.randomUUID(), content: { title: 'PRIVATE_SESSION_CURRICULUM', curriculum: 'Synthetic', gradeLevel: '8', subject: 'Math', language: 'en', objectives: 'Synthetic objective', body: 'PRIVATE_SESSION_CURRICULUM_BODY', rightsStatement: 'Synthetic author permission', sourceReference: '', sourceUrl: null } });
  const reading = await readings.createReadingCheck(principal, { clientCheckId: crypto.randomUUID(), classId: 'class-a', studentId: 'student-a', language: 'en', passageReference: 'PRIVATE_SESSION_READING', readingDate: '2026-10-05', durationSeconds: 60, wordsAttempted: 20, wordsCorrect: 10 });
  const staged = await imports.stageReadingImport(principal, { clientImportId: crypto.randomUUID(), envelope: { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic scope source', sourceReference: 'PRIVATE_SESSION_IMPORT', rows: [{ externalReference: 'synthetic-one', studentId: 'student-a', language: 'en', passageReference: 'Synthetic passage', readingDate: '2026-10-05', durationSeconds: 60, wordsAttempted: 20, wordsCorrect: 10 }] } });
  const attempt = await submissions.submitAssignment({ id: 'student-user-a', role: 'student', schoolId: 'a' }, assignment.id, { clientSubmissionId: crypto.randomUUID(), expectedAttempt: 0, response: 'PRIVATE_SESSION_ATTEMPT' });
  const reviewInput = { clientFeedbackId: crypto.randomUUID(), expectedRevision: 0, reviewed: true, feedback: 'PRIVATE_SESSION_FEEDBACK' };
  const feedback = await submissions.reviewSubmission(principal, assignment.id, attempt.id, reviewInput);
  await f.db.insert(f.schema.attendance).values({ id: 'attendance-session-control', studentId: 'student-a', classId: 'class-a', date: '2026-10-05', status: 'present', note: 'PRIVATE_SESSION_ATTENDANCE', recordedBy: 'teacher-a', createdAt: stamp, updatedAt: stamp });
  const cookies = {}, originalHashes = {}; for (const actor of [...roles, 'admin-b']) { cookies[actor] = (await sessions.createSession(actor)).split(';')[0]; originalHashes[actor] = f.sqlite.prepare('SELECT token_hash FROM auth_sessions WHERE user_id=?').get(actor).token_hash; }
  let intercept, hit = false; const statements = [];
  function prepare(query, values = []) {
    async function before() { statements.push(query); if (!hit && intercept?.match(query)) { hit = true; await intercept.run(); } }
    return { bind(...params) { return prepare(query, params); }, async raw() { await before(); const s = f.sqlite.prepare(query); s.setReturnArrays(true); return s.all(...values); }, async all() { await before(); return { success: true, results: f.sqlite.prepare(query).all(...values), meta: {} }; }, async run() { await before(); const s = f.sqlite.prepare(query); if (s.columns().length) return { success: true, results: s.all(...values), meta: {} }; return { success: true, results: [], meta: { changes: Number(s.run(...values).changes) } }; } };
  }
  const db = drizzle({ prepare, async batch(ss) { f.sqlite.exec('BEGIN'); try { const out = []; for (const s of ss) out.push(await s.run()); f.sqlite.exec('COMMIT'); return out; } catch (error) { f.sqlite.exec('ROLLBACK'); throw error; } } }, { schema: f.schema }); globalThis.__sahaTestDb = db;
  function arm(match, run) { hit = false; intercept = { match, run }; }
  function stop() { intercept = undefined; }
  function invalidate(actor, mode = 'revoke') { const tokenHash = originalHashes[actor]; okay(Boolean(tokenHash), 'A real synthetic original session exists before mutation'); if (mode === 'expire') f.sqlite.prepare('UPDATE auth_sessions SET expires_at=0 WHERE token_hash=?').run(tokenHash); else f.sqlite.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash); }
  async function api(name, actor = 'admin-a', method = 'GET', payload, query = '', context) {
    requests++; const headers = { origin, ...(cookies[actor] ? { cookie: cookies[actor] } : {}) }; if (payload !== undefined) headers['content-type'] = 'application/json';
    const response = await (name === 'submissions' ? submissionRoute : name === 'feedback' ? feedbackRoute : routes[name])[method](new Request(origin + '/api/' + (routePaths[name] ?? name) + query, { method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) }), context);
    check(response.headers.get('cache-control'), 'no-store', 'Session-scoped route evidence is never cacheable'); const body = await response.json(); check(response.bodyUsed, true, 'The actual route response is consumed'); return { status: response.status, body };
  }
  async function resolved(actor) { const p = await auth.getPrincipal(new Request(origin, { headers: { cookie: cookies[actor] } })); okay(p, 'Real opaque cookie resolves current principal before adversarial action'); return p; }
  try { await action({ ...f, db, cookies, resource, assignment, source, reading, staged, attempt, feedback, reviewInput, api, resolved, arm, stop, invalidate, statements, hit: () => hit }); scenarios++; }
  finally { stop(); f.sqlite.close(); }
}
try {
  for (const actor of roles) for (const mode of ['revoke', 'expire']) await scenario(actor + ' late ' + mode + ' at actual student read', async ({ api, arm, invalidate, hit }) => {
    const control = await api('students', actor); check(control.status, 200, 'Current real session can read its authorized student list'); okay(control.body.length > 0, 'Valid control has actual private rows rather than vacuous empty data');
    arm(q => q.includes('from "students"'), () => invalidate(actor, mode)); const denied = await api('students', actor); check(hit(), true, 'Revocation occurs immediately before the awaited actual protected SQL'); check(denied.body, [], 'Revoked original session cannot read private student rows after Principal resolution'); check(denied.status, 200, 'Collection keeps its existing scoped empty response shape'); check((await api('students', actor)).status, 401, 'Subsequent HTTP request fails authentication');
  });
  const protectedLists = [
    ['guardians', 'admin-a', 'from "guardians"', '', 'guardian-profile-a'], ['classes', 'teacher-a', 'from "classes"', '', 'class-a'], ['courses', 'student-user-a', 'from "courses"', '', 'course-a'],
    ['attendance', 'guardian-a', 'from "attendance"', '?classId=class-a', 'attendance-session-control'], ['assessments', 'teacher-a', 'from "assessments"', '', 'assessment-a'], ['reports', 'guardian-a', 'from "report_cards"', '', 'published-a'], ['notices', 'guardian-a', 'from "notifications"', '', 'notice-guardian-a'],
    ['users', 'admin-a', 'from "users"', '', 'teacher-a'], ['profileLinks', 'admin-a', 'from "users"', '', 'student-a'], ['resources', 'teacher-a', 'from "teaching_resources"', '', 'PRIVATE_SESSION_RESOURCE'],
    ['curriculum', 'teacher-a', 'from "curriculum_references"', '', 'PRIVATE_SESSION_CURRICULUM'], ['readings', 'teacher-a', 'from "reading_checks"', '', 'PRIVATE_SESSION_READING'], ['imports', 'teacher-a', 'from "reading_import_drafts"', '', 'PRIVATE_SESSION_IMPORT'], ['assignments', 'student-user-a', 'from "resource_assignments"', '', 'PRIVATE_SESSION_RESOURCE'],
  ];
  for (const [name, actor, target, query, marker] of protectedLists) await scenario(name + ' actual protected read denies original revoked session', async ({ api, arm, invalidate, hit }) => {
    const control = await api(name, actor, 'GET', undefined, query); check(control.status, 200, 'Valid current session reaches production route'); okay(JSON.stringify(control.body).includes(marker), 'Control contains the actual scoped synthetic evidence'); arm(q => q.includes(target) && !q.includes('from "auth_sessions"'), () => invalidate(actor)); const denied = await api(name, actor, 'GET', undefined, query); check(hit(), true, 'Actual protected SELECT is intercepted after authentication'); check(JSON.stringify(denied.body).includes(marker), false, 'Revoked original cannot expose scoped marker'); okay([200, 401, 403, 404, 409].includes(denied.status), 'Revocation yields the existing safe collection or denied response, never a server error');
  });
  for (const actor of roles) await scenario(actor + ' token-specific dashboard denial and fresh session recovery', async ({ resolved, invalidate, sqlite }) => {
    const old = await resolved(actor); const hash = sqlite.prepare('SELECT token_hash FROM auth_sessions WHERE user_id=?').get(actor).token_hash; const current = await dashboards.getRoleDashboard(old); check(current.role, old.role, 'Authorized dashboard retains actual role'); check(Object.keys(old).sort(), ['id', 'role', 'schoolId'], 'Private verified-session evidence is absent from public Principal shape'); check(JSON.stringify(current).includes(hash), false, 'Session hash cannot leak into dashboard DTO'); check(JSON.stringify(old).includes(hash), false, 'Session evidence is absent from serialized principal');
    await sessions.createSession(actor); invalidate(actor); check(await dashboards.getRoleDashboard(old), null, 'Another active session cannot rescue the original revoked Principal'); const rows = sqlite.prepare('SELECT token_hash FROM auth_sessions WHERE user_id=?').all(actor); check(rows.length, 1, 'Independent newer valid session remains persisted'); const newCookie = (await sessions.createSession(actor)).split(';')[0]; const fresh = await auth.getPrincipal(new Request(origin, { headers: { cookie: newCookie } })); okay(fresh, 'New same-actor session independently resolves'); check((await dashboards.getRoleDashboard(fresh)).role, old.role, 'Fresh same-actor session can recover current dashboard access'); check(Object.isFrozen(old), true, 'Verified original Principal cannot be accidentally rebased'); check(Reflect.set(old, 'role', 'admin'), false, 'Mutation cannot promote a verified public principal');
  });
  for (const kind of ['students', 'guardians']) for (const mode of ['revoke', 'expire']) await scenario(kind + ' actual legacy profile create denies late ' + mode, async ({ api, arm, invalidate, hit, sqlite }) => {
    const payload = kind === 'students' ? { schoolId: 'a', firstName: 'Synthetic New', lastName: 'Profile', dateOfBirth: '2012-01-01', admissionNumber: 'SESSION-REVOKE-NEW', gradeLevel: '8' } : { name: 'Synthetic New Guardian', relationship: 'parent' };
    const before = sqlite.prepare('SELECT count(*) n FROM ' + kind).get().n; arm(q => q.includes('insert into "' + kind + '"'), () => invalidate('admin-a', mode)); const denied = await api(kind, 'admin-a', 'POST', payload); check(hit(), true, 'Session changes immediately before actual profile INSERT SELECT'); okay([401, 403, 409].includes(denied.status), 'Late revoked create safely denies without claiming saved'); check(sqlite.prepare('SELECT count(*) n FROM ' + kind).get().n, before, 'No unauthorized profile is persisted');
  });
  const mutations = [
    ['courses', 'admin-a', 'courses', () => ({ schoolId: 'a', code: 'NEW-SESSION-COURSE', title: 'Synthetic course', gradeLevel: '8' }), ['courses']],
    ['resources', 'teacher-a', 'teaching_resources', () => ({ clientResourceId: crypto.randomUUID(), content }), ['teaching_resources', 'resource_versions']],
    ['curriculum', 'teacher-a', 'curriculum_references', () => ({ clientReferenceId: crypto.randomUUID(), content: { title: 'Synthetic new source', curriculum: 'Synthetic', gradeLevel: '8', subject: 'Math', language: 'en', objectives: 'Synthetic objective', body: 'Synthetic source body', rightsStatement: 'Synthetic permission', sourceReference: '', sourceUrl: null } }), ['curriculum_references', 'curriculum_reference_versions']],
    ['readings', 'teacher-a', 'reading_checks', () => ({ clientCheckId: crypto.randomUUID(), classId: 'class-a', studentId: 'student-a', language: 'en', passageReference: 'Synthetic new passage', readingDate: '2026-10-05', durationSeconds: 60, wordsAttempted: 20, wordsCorrect: 10 }), ['reading_checks']],
    ['imports', 'teacher-a', 'reading_import_drafts', () => ({ clientImportId: crypto.randomUUID(), envelope: { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic new scope source', sourceReference: 'Synthetic new import', rows: [{ externalReference: 'synthetic-new', studentId: 'student-a', language: 'en', passageReference: 'Synthetic passage', readingDate: '2026-10-05', durationSeconds: 60, wordsAttempted: 20, wordsCorrect: 10 }] } }), ['reading_import_drafts', 'reading_import_items', 'reading_checks']],
    ['submissions', 'student-user-a', 'submission_attempts', () => ({ clientSubmissionId: crypto.randomUUID(), expectedAttempt: 1, response: 'Synthetic new attempt' }), ['submission_attempts']],
    ['feedback', 'teacher-a', 'submission_feedback', () => ({ clientFeedbackId: crypto.randomUUID(), expectedRevision: 1, reviewed: true, feedback: 'Synthetic new feedback' }), ['submission_feedback']],
  ];
  for (const [name, actor, target, payload, tables] of mutations) await scenario(name + ' persistence rechecks original session after earlier validation', async ({ api, arm, invalidate, hit, sqlite, assignment, attempt }) => {
    const before = Object.fromEntries(tables.map(table => [table, sqlite.prepare('SELECT count(*) n FROM ' + table).get().n]));
    const context = { params: Promise.resolve({ id: assignment.id, submissionId: attempt.id }) };
    arm(q => q.includes('insert into "' + target + '"'), () => invalidate(actor)); const denied = await api(name, actor, 'POST', payload(), '', context);
    check(hit(), true, 'Session changes at actual INSERT after the production validation awaits'); okay([401, 403, 404, 409].includes(denied.status), 'No late-revoked mutation claims success or crashes');
    for (const table of tables) check(sqlite.prepare('SELECT count(*) n FROM ' + table).get().n, before[table], 'No unauthorized parent/child/provenance evidence is created in ' + table);
  });
  for (const kind of ['attendanceEditor', 'assessmentEditor']) await scenario(kind + ' atomic reviewed receipt denies SQL-time session revocation', async ({ api, arm, invalidate, hit, sqlite }) => {
    const assessment = kind === 'assessmentEditor';
    const view = assessment ? await assessmentReview.getAssessmentResultEditor(principal, 'assessment-a') : await attendanceReview.getAttendanceEditor(principal, 'class-a', '2026-10-05');
    const entry = view.roster.items.find(row => row.student.id === 'student-a');
    const payload = { clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic session race review', ...(assessment ? { expectedAssessment: view.assessment, entries: [{ studentId: 'student-a', score: 0, grade: null, feedback: null, expectedRecord: entry.record }] } : { date: '2026-10-05', entries: [{ studentId: 'student-a', status: 'absent', note: entry.record.note, expectedRecord: entry.record }] }) };
    const tables = assessment ? ['assessment_results', 'assessment_reviews', 'assessment_review_entries'] : ['attendance', 'attendance_reviews', 'attendance_review_entries'];
    const before = Object.fromEntries(tables.map(table => [table, sqlite.prepare('SELECT count(*) n FROM ' + table).get().n]));
    arm(q => q.includes('insert into "' + tables[1] + '"'), () => invalidate('teacher-a'));
    const denied = await api(kind, 'teacher-a', 'POST', payload, '', { params: Promise.resolve({ id: assessment ? 'assessment-a' : 'class-a' }) });
    check(hit(), true, 'Atomic review INSERT rechecks the current original session'); okay([401, 403, 404, 409].includes(denied.status), 'Revoked review safely denies');
    for (const table of tables) check(sqlite.prepare('SELECT count(*) n FROM ' + table).get().n, before[table], 'Whole revoked review leaves no partial change in ' + table);
    if (!assessment) check(sqlite.prepare("SELECT status FROM attendance WHERE id='attendance-session-control'").get().status, 'present', 'Previously confirmed attendance remains unchanged');
  });
  for (const mutation of ['disable', 'demote', 'move', 'issuer', 'subject', 'session-user']) await scenario('Exact verified identity remains pinned across ' + mutation, async ({ resolved, sqlite }) => {
    const old = await resolved('admin-a');
    if (mutation === 'disable') sqlite.exec("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='admin-a'");
    if (mutation === 'demote') sqlite.exec("UPDATE users SET role='teacher' WHERE id='admin-a'");
    if (mutation === 'move') sqlite.exec("UPDATE users SET school_id='b' WHERE id='admin-a'");
    if (mutation === 'issuer') sqlite.exec("UPDATE users SET identity_issuer='https://different.example.invalid' WHERE id='admin-a'");
    if (mutation === 'subject') sqlite.exec("UPDATE users SET identity_subject='different-valid-subject' WHERE id='admin-a'");
    if (mutation === 'session-user') sqlite.exec("UPDATE auth_sessions SET user_id='teacher-a' WHERE user_id='admin-a'");
    check(await dashboards.getRoleDashboard(old), null, 'Actual dashboard SQL denies changed actor/session/exact trusted mapping');
  });
  await scenario('Real logout revokes only original session and preserves independent account controls', async ({ cookies, resolved, api }) => {
    const old = await resolved('guardian-a'), admin = await resolved('admin-a'); const newCookie = (await sessions.createSession('guardian-a')).split(';')[0]; await sessions.revokeSession(new Request(origin, { headers: { cookie: cookies['guardian-a'] } })); check(await dashboards.getRoleDashboard(old), null, 'Real session revocation invalidates held original Principal at SQL'); okay(await dashboards.getRoleDashboard(admin), 'Unrelated actual administrator remains authorized'); const fresh = await auth.getPrincipal(new Request(origin, { headers: { cookie: newCookie } })); check((await dashboards.getRoleDashboard(fresh)).role, 'guardian', 'Separate same-user session remains valid after one-session logout'); check((await api('students', 'guardian-a')).status, 401, 'Revoked original cookie fails next route authentication');
  });
  await scenario('Authenticated service replay hides original feedback after late session revocation', async ({ api, arm, invalidate, hit, assignment, attempt, reviewInput, sqlite }) => {
    const context = { params: Promise.resolve({ id: assignment.id, submissionId: attempt.id }) }; const control = await api('feedback', 'teacher-a', 'POST', reviewInput, '', context); check(control.status, 201, 'Valid exact prior feedback UUID returns its established receipt'); check(control.body.feedback, 'PRIVATE_SESSION_FEEDBACK', 'Replay control exposes actual original authorized review'); const count = sqlite.prepare('SELECT count(*) n FROM submission_feedback').get().n;
    arm(q => q.includes('left join "submission_feedback"'), () => invalidate('teacher-a')); const denied = await api('feedback', 'teacher-a', 'POST', reviewInput, '', context); check(hit(), true, 'Actual downstream receipt SELECT receives revocation'); check(JSON.stringify(denied.body).includes('PRIVATE_SESSION_FEEDBACK'), false, 'Revoked replay cannot disclose immutable prior feedback'); okay([401, 403, 404, 409].includes(denied.status), 'Revoked feedback retry yields safe denial'); check(sqlite.prepare('SELECT count(*) n FROM submission_feedback').get().n, count, 'Rejected replay never appends duplicate feedback');
  });
  check(externalRequests, 0, 'All authority evidence is synthetic with no external requests'); console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scenarios, requests, externalRequests, scope: 'actual opaque sessions/routes and production Drizzle D1 over SQLite; SQL-time authority mutations; no browser or provider evidence' }));
} finally { globalThis.fetch = originFetch; }
