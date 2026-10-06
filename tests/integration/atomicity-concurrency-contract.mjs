// NFR-02 data integrity (designed cases TC-013 .. TC-018, TC-021 and the recovery cases they trace to): every multi-row
// write path is exercised with an injected database failure at each written table (and at the first, second and last
// row of multi-row writes), exact retries, changed-payload reuse of a retry key, stale preconditions and concurrent
// arbitration, and the DB-level immutable-evidence triggers are listed and attacked. Real route handlers, real opaque
// sessions, fully migrated in-memory SQLite, synthetic data, no network.
//
// Failure injection model: the harness executes db.batch() inside BEGIN/COMMIT exactly like a D1 batch, and a single
// SQL statement is atomic in SQLite. A temporary trigger raises ABORT when the Nth row is written to a table; the
// whole-database fingerprint (every row of every table) must be byte-identical afterwards, and the same request must
// then succeed with the fault removed (no half-committed state blocks recovery).
import assert from 'node:assert/strict';
import { buildFixture } from '../support/authorization-fixture.mjs';
import { dispatch, origin } from '../support/route-dispatch.mjs';
import { bindings, freshDatabase } from '../support/security-db.mjs';

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
let externalRequests = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { externalRequests++; throw new Error('Offline'); };

const f = await buildFixture();
const { sqlite } = f;
const uid = () => crypto.randomUUID();
let serial = 0;
const NOISE = new Set(['auth_sessions', 'auth_rate_limits', 'oidc_transactions']);
const tableNames = () => sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
const counts = () => Object.fromEntries(tableNames().map(name => [name, sqlite.prepare(`SELECT count(*) n FROM "${name}"`).get().n]));
const run = request => f.call(request.actor, request.method, request.path, request.body === undefined ? {} : { body: request.body });
// `first` (stale scenarios only) is a prior legitimate write that makes the precondition stale.
const date = () => { const n = serial++; return `${2020 + Math.floor(n / 336)}-${String(1 + Math.floor(n / 28) % 12).padStart(2, '0')}-${String(1 + n % 28).padStart(2, '0')}`; };
const content = title => ({ title: `Atomic ${title}`, type: 'worksheet', curriculum: 'Synthetic', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Compare fractions.', body: 'Synthetic task.', teacherNotes: '', answerKey: '' });
const curriculumContent = title => ({ title: `Atomic ${title}`, curriculum: 'Synthetic', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN', objectives: 'Compare fractions.', body: 'Compare 1/2 and 1/4.', rightsStatement: 'Original synthetic content written for this test.', sourceReference: 'SYN-1' });
const reading = (key, extra = {}) => ({ clientCheckId: key, classId: 'class-a', studentId: 'student-a', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 36, ...extra });
const newResource = async (approved = false) => {
  const resource = await f.must('teacher-a', 'POST', '/api/resources', { body: { clientResourceId: uid(), content: content('setup ' + serial++) } });
  if (approved) await f.must('teacher-a', 'POST', `/api/resources/${resource.id}/approve`, { body: { versionId: resource.latest.id } });
  return resource;
};
const newAssessment = async () => f.must('teacher-a', 'POST', '/api/assessments', { body: { classId: 'class-a', title: 'Atomic quiz ' + serial++, kind: 'quiz', maxScore: 10, date: '2026-10-06' } });
const newSubmission = async () => {
  const attempt = sqlite.prepare("SELECT count(*) n FROM submission_attempts WHERE assignment_id=? AND student_id='student-a'").get(f.ids.assignment).n;
  return f.must('student-user-a', 'POST', `/api/assignments/${f.ids.assignment}/submissions`, { body: { response: 'Atomic setup answer ' + serial++, expectedAttempt: attempt, clientSubmissionId: uid() } });
};
const eligibleStudent = async n => f.must('admin-a', 'POST', '/api/students', { body: { schoolId: 'a', firstName: 'Atomic', lastName: 'Learner' + n, dateOfBirth: '2012-01-01', admissionNumber: 'ATOMIC-' + n + '-' + uid().slice(0, 6), gradeLevel: '8' } });
const provision = async (role, n, key = uid()) => f.must('admin-a', 'POST', '/api/admin/users', { body: { clientRequestId: key, name: `Atomic ${role} ${n}`, email: `atomic-${n}-${uid().slice(0, 6)}@example.invalid`, role, identityIssuer: 'https://identity.example.invalid', identitySubject: `atomic-${role}-${n}-${uid().slice(0, 8)}`, reviewConfirmed: true, reason: 'Reviewed synthetic identity against approved roster' } });

// Each scenario: setup() builds a fresh precondition; req(ctx, key) is the write; ok are the success statuses; retry the
// statuses an exact retry may return; mismatch(ctx) reuses the retry key with a different payload (must be 409 and
// write nothing); stale(ctx) violates the version precondition (must be 409 and write nothing); race is the contention
// model: 'one-winner' = concurrent requests with different client ids and the same precondition, exactly one wins.
const scenarios = [
  { name: 'resource create (POST /api/resources)', ok: [201], retry: [201],
    setup: async () => ({ key: uid(), title: 'create ' + serial++ }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: '/api/resources', body: { clientResourceId: key, content: content(ctx.title) } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: '/api/resources', body: { clientResourceId: ctx.key, content: content(ctx.title + ' changed') } }) },
  { name: 'resource revision (PATCH /api/resources/[id])', ok: [200], retry: [409],
    setup: async () => ({ resource: await newResource() }),
    req: ctx => ({ actor: 'teacher-a', method: 'PATCH', path: `/api/resources/${ctx.resource.id}`, body: { expectedVersion: 1, content: content('revised ' + serial++) } }),
    stale: ctx => ({ actor: 'teacher-a', method: 'PATCH', path: `/api/resources/${ctx.resource.id}`, body: { expectedVersion: 7, content: content('stale') } }), race: 'one-winner' },
  { name: 'resource approval (POST /api/resources/[id]/approve)', ok: [200], retry: [200, 409],
    setup: async () => ({ resource: await newResource() }),
    req: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/resources/${ctx.resource.id}/approve`, body: { versionId: ctx.resource.latest.id } }) },
  { name: 'resource assignment (POST /api/resources/[id]/assign)', ok: [201], retry: [201],
    setup: async () => ({ resource: await newResource(true) }),
    req: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/resources/${ctx.resource.id}/assign`, body: { versionId: ctx.resource.latest.id, classId: 'class-a' } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/resources/${ctx.resource.id}/assign`, body: { versionId: ctx.resource.latest.id, classId: 'class-a', dueDate: '2027-01-01' } }) },
  { name: 'curriculum create (POST /api/curriculum)', ok: [201], retry: [201],
    setup: async () => ({ key: uid(), title: 'ref ' + serial++ }),
    req: (ctx, key = ctx.key) => ({ actor: 'admin-a', method: 'POST', path: '/api/curriculum', body: { clientReferenceId: key, content: curriculumContent(ctx.title) } }),
    mismatch: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/curriculum', body: { clientReferenceId: ctx.key, content: curriculumContent(ctx.title + ' changed') } }) },
  { name: 'curriculum revision (PATCH /api/curriculum/[id])', ok: [200], retry: [409],
    setup: async () => ({ reference: await f.must('admin-a', 'POST', '/api/curriculum', { body: { clientReferenceId: uid(), content: curriculumContent('base ' + serial++) } }) }),
    req: ctx => ({ actor: 'admin-a', method: 'PATCH', path: `/api/curriculum/${ctx.reference.id}`, body: { expectedVersion: 1, content: curriculumContent('revised ' + serial++) } }),
    stale: ctx => ({ actor: 'admin-a', method: 'PATCH', path: `/api/curriculum/${ctx.reference.id}`, body: { expectedVersion: 9, content: curriculumContent('stale') } }), race: 'one-winner' },
  { name: 'curriculum approval (POST /api/curriculum/[id]/approve)', ok: [200], retry: [200, 409],
    setup: async () => ({ reference: await f.must('admin-a', 'POST', '/api/curriculum', { body: { clientReferenceId: uid(), content: curriculumContent('approve ' + serial++) } }) }),
    req: ctx => ({ actor: 'admin-a', method: 'POST', path: `/api/curriculum/${ctx.reference.id}/approve`, body: { versionId: ctx.reference.latest.id, confirmReview: true } }) },
  { name: 'curriculum copy to resource draft (POST /api/curriculum/[id]/draft)', ok: [201], retry: [201],
    setup: async () => ({ key: uid() }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: `/api/curriculum/${f.ids.curriculum}/draft`, body: { versionId: f.ids.curriculumVersion, type: 'worksheet', clientResourceId: key } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/curriculum/${f.ids.curriculum}/draft`, body: { versionId: f.ids.curriculumVersion, type: 'quiz', clientResourceId: ctx.key } }) },
  { name: 'identity provisioning (POST /api/admin/users)', ok: [201], retry: [200, 201, 409],
    setup: async () => ({ key: uid(), n: serial++, subject: 'atomic-subject-' + uid() }),
    req: (ctx, key = ctx.key) => ({ actor: 'admin-a', method: 'POST', path: '/api/admin/users', body: { clientRequestId: key, name: 'Atomic account ' + ctx.n, email: `atomic-${ctx.n}-${ctx.subject.slice(-6)}@example.invalid`, role: 'teacher', identityIssuer: 'https://identity.example.invalid', identitySubject: ctx.subject, reviewConfirmed: true, reason: 'Reviewed synthetic identity against approved roster' } }),
    mismatch: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/admin/users', body: { clientRequestId: ctx.key, name: 'Changed name', email: `atomic-${ctx.n}-${ctx.subject.slice(-6)}@example.invalid`, role: 'teacher', identityIssuer: 'https://identity.example.invalid', identitySubject: ctx.subject, reviewConfirmed: true, reason: 'Reviewed synthetic identity against approved roster' } }), race: 'one-winner' },
  { name: 'identity status change (PATCH /api/admin/users/[id])', ok: [200], retry: [200],
    setup: async () => { const created = await provision('teacher', serial++); return { key: uid(), userId: created.user.id }; },
    req: (ctx, key = ctx.key) => ({ actor: 'admin-a', method: 'PATCH', path: `/api/admin/users/${ctx.userId}`, body: { clientRequestId: key, expectedVersion: 1, enabled: false, reviewConfirmed: true, reason: 'Synthetic reviewed disablement.' } }),
    mismatch: ctx => ({ actor: 'admin-a', method: 'PATCH', path: `/api/admin/users/${ctx.userId}`, body: { clientRequestId: ctx.key, expectedVersion: 1, enabled: true, reviewConfirmed: true, reason: 'Synthetic reviewed disablement.' } }),
    stale: ctx => ({ actor: 'admin-a', method: 'PATCH', path: `/api/admin/users/${ctx.userId}`, body: { clientRequestId: uid(), expectedVersion: 9, enabled: false, reviewConfirmed: true, reason: 'Synthetic stale disablement.' } }), race: 'one-winner' },
  { name: 'profile ownership link (POST /api/admin/profile-links)', ok: [200], retry: [200],
    setup: async () => { const n = serial++; const student = await eligibleStudent(n); const account = await provision('student', n); return { key: uid(), profileId: student.id, userId: account.user.id }; },
    req: (ctx, key = ctx.key) => ({ actor: 'admin-a', method: 'POST', path: '/api/admin/profile-links', body: { profileType: 'student', profileId: ctx.profileId, userId: ctx.userId, expectedVersion: 0, clientRequestId: key, reviewConfirmed: true, reason: 'Synthetic explicit profile ownership review.' } }),
    mismatch: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/admin/profile-links', body: { profileType: 'student', profileId: ctx.profileId, userId: null, expectedVersion: 0, clientRequestId: ctx.key, reviewConfirmed: true, reason: 'Synthetic explicit profile ownership review.' } }),
    stale: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/admin/profile-links', body: { profileType: 'student', profileId: ctx.profileId, userId: ctx.userId, expectedVersion: 9, clientRequestId: uid(), reviewConfirmed: true, reason: 'Synthetic explicit profile ownership review.' } }), race: 'one-winner' },
  { name: 'reading check create (POST /api/reading-checks)', ok: [201], retry: [201],
    setup: async () => ({ key: uid() }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: '/api/reading-checks', body: reading(key) }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: '/api/reading-checks', body: reading(ctx.key, { wordsCorrect: 10 }) }) },
  { name: 'reading correction (POST /api/reading-checks/[id]/corrections)', ok: [201], retry: [201],
    setup: async () => ({ key: uid(), check: await f.must('teacher-a', 'POST', '/api/reading-checks', { body: reading(uid()) }) }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: `/api/reading-checks/${ctx.check.id}/corrections`, body: { clientCorrectionId: key, expectedRevision: 0, confirmReviewed: true, reason: 'Synthetic reviewed correction.', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 37 } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/reading-checks/${ctx.check.id}/corrections`, body: { clientCorrectionId: ctx.key, expectedRevision: 0, confirmReviewed: true, reason: 'Synthetic reviewed correction.', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 5 } }),
    stale: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/reading-checks/${ctx.check.id}/corrections`, body: { clientCorrectionId: uid(), expectedRevision: 5, confirmReviewed: true, reason: 'Synthetic stale correction.', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 37 } }), race: 'one-winner' },
  { name: 'reading import stage (POST /api/reading-imports)', ok: [201], retry: [200, 201],
    setup: async () => ({ key: uid(), ref: 'atomic-stage-' + uid() }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: '/api/reading-imports', body: { clientImportId: key, envelope: { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic namespace', sourceReference: 'Atomic batch', rows: [{ externalReference: ctx.ref + '-1', studentId: 'student-a', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 36 }, { externalReference: ctx.ref + '-2', studentId: 'student-peer', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 50, wordsAttempted: 44, wordsCorrect: 40 }] } } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: '/api/reading-imports', body: { clientImportId: ctx.key, envelope: { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic namespace', sourceReference: 'Atomic batch', rows: [{ externalReference: ctx.ref + '-9', studentId: 'student-a', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 1 }] } } }) },
  { name: 'reading import confirm (POST /api/reading-imports/[id]/decision)', ok: [200], retry: [200, 409],
    setup: async () => {
      const ref = 'atomic-confirm-' + uid();
      const staged = await f.must('teacher-a', 'POST', '/api/reading-imports', { body: { clientImportId: uid(), envelope: { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic namespace', sourceReference: 'Atomic batch', rows: [{ externalReference: ref + '-1', studentId: 'student-a', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 45, wordsAttempted: 40, wordsCorrect: 36 }, { externalReference: ref + '-2', studentId: 'student-peer', language: 'en-IN', passageReference: 'Atomic passage', readingDate: '2026-10-01', durationSeconds: 50, wordsAttempted: 44, wordsCorrect: 40 }] } } });
      return { key: uid(), draft: staged.draft.id };
    },
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: `/api/reading-imports/${ctx.draft}/decision`, body: { clientDecisionId: key, expectedRevision: 0, action: 'confirm', confirmReviewed: true, reason: 'Synthetic reviewed confirmation.' } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/reading-imports/${ctx.draft}/decision`, body: { clientDecisionId: ctx.key, expectedRevision: 0, action: 'reject', confirmReviewed: true, reason: 'Synthetic reviewed confirmation.' } }),
    stale: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/reading-imports/${ctx.draft}/decision`, body: { clientDecisionId: uid(), expectedRevision: 0, action: 'reject', confirmReviewed: true, reason: 'Synthetic second decision.' }, first: { actor: 'teacher-a', method: 'POST', path: `/api/reading-imports/${ctx.draft}/decision`, body: { clientDecisionId: ctx.key, expectedRevision: 0, action: 'confirm', confirmReviewed: true, reason: 'Synthetic reviewed confirmation.' } } }), race: 'one-winner' },
  { name: 'legacy attendance batch (POST /api/attendance)', ok: [200], retry: [200], retryRewritesRows: true,
    setup: async () => ({ day: date() }),
    req: ctx => ({ actor: 'teacher-a', method: 'POST', path: '/api/attendance', body: { classId: 'class-a', date: ctx.day, entries: [{ studentId: 'student-a', status: 'present' }, { studentId: 'student-peer', status: 'absent', note: 'Synthetic' }] } }) },
  { name: 'reviewed attendance (POST /api/classes/[id]/attendance-editor)', ok: [201], retry: [200],
    setup: async () => ({ key: uid(), day: date() }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: '/api/classes/class-a/attendance-editor', body: { date: ctx.day, clientRequestId: key, reviewConfirmed: true, reason: 'Synthetic reviewed attendance change.', entries: [{ studentId: 'student-a', status: 'present', note: null, expectedRecord: null }, { studentId: 'student-peer', status: 'late', note: null, expectedRecord: null }] } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: '/api/classes/class-a/attendance-editor', body: { date: ctx.day, clientRequestId: ctx.key, reviewConfirmed: true, reason: 'Synthetic reviewed attendance change.', entries: [{ studentId: 'student-a', status: 'absent', note: null, expectedRecord: null }, { studentId: 'student-peer', status: 'late', note: null, expectedRecord: null }] } }), race: 'one-winner' },
  { name: 'legacy result batch (POST /api/assessments/[id]/results)', ok: [200], retry: [200], retryRewritesRows: true,
    setup: async () => ({ assessment: await newAssessment() }),
    req: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/assessments/${ctx.assessment.id}/results`, body: { results: [{ studentId: 'student-a', score: 7, grade: 'B', feedback: 'Synthetic.' }, { studentId: 'student-peer', score: 5, grade: 'C' }] } }) },
  { name: 'reviewed results (POST /api/assessments/[id]/result-editor)', ok: [201], retry: [200],
    setup: async () => { const assessment = await newAssessment(); const snapshot = await f.must('teacher-a', 'GET', `/api/assessments/${assessment.id}/result-editor`); return { key: uid(), assessment, snapshot }; },
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: `/api/assessments/${ctx.assessment.id}/result-editor`, body: { clientRequestId: key, reviewConfirmed: true, reason: 'Synthetic explicit assessment result review.', expectedAssessment: ctx.snapshot.assessment, entries: [{ studentId: 'student-a', score: 7, grade: 'B', feedback: 'Synthetic.', expectedRecord: null }, { studentId: 'student-peer', score: 5, grade: 'C', feedback: null, expectedRecord: null }] } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/assessments/${ctx.assessment.id}/result-editor`, body: { clientRequestId: ctx.key, reviewConfirmed: true, reason: 'Synthetic explicit assessment result review.', expectedAssessment: ctx.snapshot.assessment, entries: [{ studentId: 'student-a', score: 1, grade: 'B', feedback: 'Synthetic.', expectedRecord: null }, { studentId: 'student-peer', score: 5, grade: 'C', feedback: null, expectedRecord: null }] } }), race: 'one-winner' },
  { name: 'registry pupil creation (POST /api/registry/students)', ok: [201], retry: [200],
    setup: async () => ({ key: uid(), admission: 'ATOMIC-REG-' + uid().slice(0, 8) }),
    req: (ctx, key = ctx.key) => ({ actor: 'admin-a', method: 'POST', path: '/api/registry/students', body: { clientRequestId: key, reviewConfirmed: true, reason: 'Synthetic administrator creation review', profile: { firstName: 'Atomic', lastName: 'Registry', dateOfBirth: '2012-01-01', admissionNumber: ctx.admission, gradeLevel: '8' } } }),
    mismatch: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/registry/students', body: { clientRequestId: ctx.key, reviewConfirmed: true, reason: 'Synthetic administrator creation review', profile: { firstName: 'Changed', lastName: 'Registry', dateOfBirth: '2012-01-01', admissionNumber: ctx.admission, gradeLevel: '8' } } }), race: 'one-winner' },
  { name: 'registry guardian creation (POST /api/registry/guardians)', ok: [201], retry: [200],
    setup: async () => ({ key: uid(), name: 'Atomic guardian ' + uid().slice(0, 6) }),
    req: (ctx, key = ctx.key) => ({ actor: 'admin-a', method: 'POST', path: '/api/registry/guardians', body: { clientRequestId: key, reviewConfirmed: true, reason: 'Synthetic administrator creation review', profile: { name: ctx.name, relationship: 'parent' } } }),
    mismatch: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/registry/guardians', body: { clientRequestId: ctx.key, reviewConfirmed: true, reason: 'Synthetic administrator creation review', profile: { name: ctx.name + ' changed', relationship: 'parent' } } }) },
  { name: 'report publication (PATCH /api/report-cards/[id])', ok: [200], retry: [200],
    setup: async () => ({ report: await f.must('admin-a', 'POST', '/api/report-cards', { body: { studentId: 'student-a', term: 'Atomic ' + uid().slice(0, 8), overallGrade: 'C', summary: 'Synthetic.' } }) }),
    req: ctx => ({ actor: 'admin-a', method: 'PATCH', path: `/api/report-cards/${ctx.report.id}`, body: { publish: true } }) },
  { name: 'enrolment create (POST /api/enrolments)', ok: [201], retry: [409],
    setup: async () => ({ student: await eligibleStudent(serial++) }),
    req: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/enrolments', body: { studentId: ctx.student.id, classId: 'class-a' } }), race: 'one-winner' },
  { name: 'report draft create (POST /api/report-cards)', ok: [201], retry: [201], retryRewritesRows: true, retryAddsRows: true,
    setup: async () => ({ term: 'Atomic ' + uid().slice(0, 8) }),
    req: ctx => ({ actor: 'admin-a', method: 'POST', path: '/api/report-cards', body: { studentId: 'student-a', term: ctx.term, overallGrade: 'B', summary: 'Synthetic.' } }) },
  // Learner recovery paths last: the window scenario changes whether learners may submit.
  { name: 'learner submission (POST /api/assignments/[id]/submissions)', ok: [201], retry: [200, 201, 409],
    setup: async () => ({ key: uid(), attempt: sqlite.prepare("SELECT count(*) n FROM submission_attempts WHERE assignment_id=? AND student_id='student-a'").get(f.ids.assignment).n }),
    req: (ctx, key = ctx.key) => ({ actor: 'student-user-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submissions`, body: { response: 'Atomic learner answer.', expectedAttempt: ctx.attempt, clientSubmissionId: key } }),
    mismatch: ctx => ({ actor: 'student-user-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submissions`, body: { response: 'A different answer.', expectedAttempt: ctx.attempt, clientSubmissionId: ctx.key } }),
    stale: ctx => ({ actor: 'student-user-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submissions`, body: { response: 'Stale attempt.', expectedAttempt: ctx.attempt + 4, clientSubmissionId: uid() } }), race: 'one-winner' },
  { name: 'staff feedback (POST /api/assignments/[id]/submissions/[id]/feedback)', ok: [201], retry: [200, 201, 409],
    setup: async () => ({ key: uid(), submission: await newSubmission() }),
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submissions/${ctx.submission.id}/feedback`, body: { feedback: 'Reviewed formative guidance.', reviewed: true, expectedRevision: 0, clientFeedbackId: key } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submissions/${ctx.submission.id}/feedback`, body: { feedback: 'Different guidance.', reviewed: true, expectedRevision: 0, clientFeedbackId: ctx.key } }),
    stale: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submissions/${ctx.submission.id}/feedback`, body: { feedback: 'Stale guidance.', reviewed: true, expectedRevision: 5, clientFeedbackId: uid() } }), race: 'one-winner' },
  { name: 'submission window policy (POST /api/assignments/[id]/submission-window)', ok: [201], retry: [200, 201],
    setup: async () => {
      const latest = sqlite.prepare('SELECT revision, state FROM assignment_submission_windows WHERE assignment_id=? ORDER BY revision DESC LIMIT 1').get(f.ids.assignment);
      return { key: uid(), revision: latest.revision, state: latest.state === 'open' ? 'closed' : 'open' };
    },
    req: (ctx, key = ctx.key) => ({ actor: 'teacher-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submission-window`, body: { clientPolicyId: key, expectedRevision: ctx.revision, state: ctx.state, closesAt: null, reviewConfirmed: true, reason: 'Synthetic reviewed window policy.' } }),
    mismatch: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submission-window`, body: { clientPolicyId: ctx.key, expectedRevision: ctx.revision, state: ctx.state === 'open' ? 'closed' : 'open', closesAt: null, reviewConfirmed: true, reason: 'Synthetic reviewed window policy.' } }),
    stale: ctx => ({ actor: 'teacher-a', method: 'POST', path: `/api/assignments/${f.ids.assignment}/submission-window`, body: { clientPolicyId: uid(), expectedRevision: ctx.revision + 5, state: ctx.state, closesAt: null, reviewConfirmed: true, reason: 'Synthetic stale window policy.' } }), race: 'one-winner' },
];

// ---------------------------------------------------------------------------------------------------------------
// Section 1: the immutable-evidence triggers (existing migrations 0007-0015 plus 0025) are listed and attacked.
// ---------------------------------------------------------------------------------------------------------------
const EXPECTED_TRIGGERS = ['assessment_results_pair_insert_guard', 'assessment_results_pair_update_guard', 'assessment_review_authority', 'assessment_review_commit', 'assessment_review_entries_no_delete', 'assessment_review_entries_no_update', 'assessment_reviews_no_delete', 'assessment_reviews_no_update', 'assignment_submission_windows_no_delete', 'assignment_submission_windows_no_update', 'attendance_review_authority', 'attendance_review_commit', 'attendance_review_entries_no_delete', 'attendance_review_entries_no_update', 'attendance_reviews_no_delete', 'attendance_reviews_no_update', 'curriculum_reference_versions_content_immutable', 'curriculum_reference_versions_no_delete', 'enrolments_pair_insert_guard', 'enrolments_pair_update_guard', 'guardians_unique_login_change', 'guardians_unique_login_insert', 'identity_admin_events_no_delete', 'identity_admin_events_no_update', 'profile_link_events_no_delete', 'profile_link_events_no_update', 'reading_checks_no_delete', 'reading_checks_no_update', 'reading_corrections_no_delete', 'reading_corrections_no_update', 'reading_import_confirm', 'reading_import_item_no_delete', 'reading_import_item_no_update', 'reading_import_no_delete', 'reading_import_preserve_draft', 'reading_import_receipt_no_delete', 'reading_import_receipt_no_update', 'reading_import_stage_items', 'registry_creation_authority', 'registry_creation_commit', 'registry_creation_receipts_no_delete', 'registry_creation_receipts_no_update', 'report_publication_authority', 'report_publication_commit', 'report_publication_no_delete', 'report_publication_no_update', 'resource_assignments_no_delete', 'resource_assignments_no_update', 'resource_reference_bindings_no_delete', 'resource_reference_bindings_no_update', 'resource_versions_content_immutable', 'resource_versions_no_delete', 'submission_attempts_no_delete', 'submission_attempts_no_update', 'submission_feedback_no_delete', 'submission_feedback_no_update'];
{
  const triggers = sqlite.prepare("SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  equal(triggers.map(trigger => trigger.name), EXPECTED_TRIGGERS, 'The complete trigger inventory (56) matches the documented list: no guard silently dropped or added');
  // Reach the states that create rows in the remaining evidence tables.
  await f.must('teacher-a', 'POST', `/api/reading-imports/${f.ids.import}/decision`, { body: { clientDecisionId: uid(), expectedRevision: 0, action: 'confirm', confirmReviewed: true, reason: 'Synthetic reviewed confirmation.' } });
  await f.must('teacher-a', 'POST', `/api/curriculum/${f.ids.curriculum}/draft`, { body: { versionId: f.ids.curriculumVersion, type: 'worksheet', clientResourceId: uid() } });
  const unconditional = triggers.map(trigger => ({ ...trigger, match: /^CREATE TRIGGER\s+`?(\w+)`?\s+BEFORE (UPDATE|DELETE) ON\s+`?(\w+)`?\s+BEGIN\s+SELECT RAISE\(ABORT,\s*'([^']+)'\)/i.exec(trigger.sql.replace(/\s+/g, ' ')) }))
    .filter(trigger => trigger.match);
  const kinds = new Map();
  for (const trigger of unconditional) kinds.set(trigger.match[3], new Set([...(kinds.get(trigger.match[3]) ?? []), trigger.match[2].toUpperCase()]));
  const immutable = [...kinds.keys()].sort();
  equal(immutable, ['assessment_review_entries', 'assessment_reviews', 'assignment_submission_windows', 'attendance_review_entries', 'attendance_reviews', 'curriculum_reference_versions', 'identity_admin_events', 'profile_link_events', 'reading_checks', 'reading_corrections', 'reading_import_drafts', 'reading_import_items', 'reading_import_receipts', 'registry_creation_receipts', 'report_publication_receipts', 'resource_assignments', 'resource_reference_bindings', 'resource_versions', 'submission_attempts', 'submission_feedback'],
    'Twenty evidence tables carry unconditional guards (versions and import drafts block DELETE only; their guarded content/review transitions are tested separately)');
  let attacks = 0;
  for (const trigger of unconditional) {
    const [, , kind, table, message] = trigger.match;
    const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
    const row = sqlite.prepare(`SELECT rowid AS rid, * FROM "${table}" LIMIT 1`).get();
    check(row !== undefined, `${table}: the fixture holds evidence to attack`);
    const before = f.fingerprint([table]);
    if (kind.toUpperCase() === 'UPDATE') {
      for (const column of columns) {
        assert.throws(() => sqlite.prepare(`UPDATE "${table}" SET "${column}" = "${column}" WHERE rowid = ?`).run(row.rid), error => error.message.includes(message), `${table}.${column} UPDATE must be refused by the trigger`);
        attacks++;
      }
    } else {
      assert.throws(() => sqlite.prepare(`DELETE FROM "${table}" WHERE rowid = ?`).run(row.rid), error => error.message.includes(message), `${table} DELETE must be refused by the trigger`);
      attacks++;
    }
    equal(f.fingerprint([table]), before, `${table}: ${kind} attack left the evidence unchanged`);
  }
  check(attacks > 120, `${attacks} UPDATE/DELETE attacks on append-only tables were each refused with the trigger's own message`);
  // Whole-table forms an attacker with a SQL foothold would try: mass UPDATE and mass DELETE.
  for (const table of immutable) {
    const before = f.fingerprint([table]);
    const columns = sqlite.prepare(`PRAGMA table_info("${table}")`).all();
    assert.throws(() => sqlite.prepare(`DELETE FROM "${table}"`).run(), /immutable|preserved|cannot|evidence|append/i, `${table} mass DELETE`);
    if (kinds.get(table).has('UPDATE')) assert.throws(() => sqlite.prepare(`UPDATE "${table}" SET "${columns[0].name}" = "${columns[0].name}"`).run(), /immutable|preserved|cannot|evidence|append/i, `${table} mass UPDATE`);
    equal(f.fingerprint([table]), before, `${table}: mass UPDATE/DELETE left the evidence unchanged`);
  }
  // Versioned content: content columns are frozen, approval stays a reviewable one-row transition.
  for (const [table, contentColumns, approvalSetter] of [
    ['resource_versions', ['id', 'resource_id', 'version', 'title', 'type', 'curriculum', 'grade_level', 'subject', 'language', 'objectives', 'body', 'teacher_notes', 'answer_key', 'created_by', 'created_at'], 'resource_versions'],
    ['curriculum_reference_versions', ['id', 'reference_id', 'version', 'title', 'curriculum', 'grade_level', 'subject', 'language', 'objectives', 'body', 'rights_statement', 'source_reference', 'source_url', 'created_by', 'created_at'], 'curriculum_reference_versions'],
  ]) {
    const allColumns = sqlite.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
    equal(allColumns.filter(column => !contentColumns.includes(column)).sort(), ['approved_at', 'approved_by'], `${table}: every column except the two approval columns is in the frozen content list (no unguarded column)`);
    const row = sqlite.prepare(`SELECT rowid AS rid, * FROM "${table}" WHERE approved_by IS NULL LIMIT 1`).get();
    check(row !== undefined, `${table}: an unapproved version exists`);
    const before = f.fingerprint([table]);
    for (const column of contentColumns) {
      assert.throws(() => sqlite.prepare(`UPDATE "${approvalSetter}" SET "${column}" = "${column}" WHERE rowid = ?`).run(row.rid), /content is immutable/, `${table}.${column} content UPDATE must be refused`);
      checks++;
    }
    assert.throws(() => sqlite.prepare(`DELETE FROM "${table}" WHERE rowid = ?`).run(row.rid), /immutable/i, `${table} DELETE must be refused`);
    equal(f.fingerprint([table]), before, `${table}: content attacks changed nothing`);
    // The approval transition itself is still possible, and only the approval columns move.
    sqlite.prepare(`UPDATE "${table}" SET approved_by = created_by, approved_at = '2026-10-06T00:00:00.000Z' WHERE rowid = ?`).run(row.rid);
    const approved = sqlite.prepare(`SELECT * FROM "${table}" WHERE rowid = ?`).get(row.rid);
    equal(contentColumns.map(column => approved[column]), contentColumns.map(column => row[column]), `${table}: approval changed no content column`);
    check(approved.approved_by === row.created_by && approved.approved_at === '2026-10-06T00:00:00.000Z', `${table}: the approval columns accept the reviewed transition`);
  }
  // The guards must not break the mutable operational tables that legitimately change.
  const classRow = sqlite.prepare("SELECT id FROM classes WHERE id='class-a'").get();
  sqlite.prepare("UPDATE classes SET term = term WHERE id = ?").run(classRow.id);
  sqlite.prepare("UPDATE teaching_resources SET created_at = created_at WHERE id = ?").run(f.ids.resource);
  check(true, 'operational tables remain updatable');
}

// ---------------------------------------------------------------------------------------------------------------
// Section 2: failure injection, retry, changed-payload, stale-precondition and concurrency per write path.
// ---------------------------------------------------------------------------------------------------------------
function installFault(table, failAtRow) {
  const base = sqlite.prepare(`SELECT count(*) n FROM "${table}"`).get().n;
  const suffix = `${table}_${failAtRow}`;
  sqlite.exec(`CREATE TRIGGER inj_ins_${suffix} BEFORE INSERT ON "${table}" WHEN (SELECT count(*) FROM "${table}") >= ${base + failAtRow} BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
  if (failAtRow === 0) {
    sqlite.exec(`CREATE TRIGGER inj_upd_${suffix} BEFORE UPDATE ON "${table}" BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
    sqlite.exec(`CREATE TRIGGER inj_del_${suffix} BEFORE DELETE ON "${table}" BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
  }
  return () => { for (const prefix of ['inj_ins_', 'inj_upd_', 'inj_del_']) sqlite.exec(`DROP TRIGGER IF EXISTS ${prefix}${suffix}`); };
}
const quiet = (fn) => async () => { const original = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = original; } };
const summary = [];
let failurePoints = 0, retries = 0, mismatches = 0, stales = 0, races = 0;
for (const scenario of scenarios) {
  // Discovery: which tables does one successful request write, and how many rows does it add?
  const discoveryContext = await scenario.setup();
  const beforeCounts = counts(), beforePrint = f.fingerprint();
  const success = await run(scenario.req(discoveryContext));
  check(scenario.ok.includes(success.status), `${scenario.name}: success is ${scenario.ok} (got ${success.status} ${success.text.slice(0, 160)})`);
  const afterPrint = f.fingerprint(), afterCounts = counts();
  const written = f.changedTables(beforePrint, afterPrint).filter(name => !NOISE.has(name));
  const added = Object.fromEntries(written.map(name => [name, afterCounts[name] - beforeCounts[name]]));
  check(written.length >= 1, `${scenario.name}: the request wrote ${written.join(', ')}`);
  // Exact retry on the same state.
  const retryPrint = f.fingerprint(), retryCounts = counts();
  const retry = await run(scenario.req(discoveryContext));
  check(scenario.retry.includes(retry.status), `${scenario.name}: exact retry is one of ${scenario.retry} (got ${retry.status} ${retry.text.slice(0, 120)})`);
  if (!scenario.retryRewritesRows) equal(f.changedTables(retryPrint, f.fingerprint()).filter(name => !NOISE.has(name)), [], `${scenario.name}: exact retry changed no table`);
  else if (!scenario.retryAddsRows) equal(counts(), retryCounts, `${scenario.name}: exact retry added no row anywhere`);
  retries++;
  if (scenario.mismatch) {
    const printBefore = f.fingerprint();
    const clash = await run(scenario.mismatch(discoveryContext));
    equal(clash.status, 409, `${scenario.name}: the retry key reused with a different payload is 409 (got ${clash.status} ${clash.text.slice(0, 100)})`);
    equal(f.changedTables(printBefore, f.fingerprint()).filter(name => !NOISE.has(name)), [], `${scenario.name}: the key clash wrote nothing`);
    mismatches++;
  }
  if (scenario.stale) {
    const staleContext = await scenario.setup();
    const staleRequest = scenario.stale(staleContext);
    if (staleRequest.first) await run(staleRequest.first);
    const printBefore = f.fingerprint();
    const stale = await run(staleRequest);
    equal(stale.status, 409, `${scenario.name}: a stale precondition is 409 (got ${stale.status} ${stale.text.slice(0, 100)})`);
    check(Object.keys(stale.json).join() === 'error' && /conflict/i.test(stale.json.error), `${scenario.name}: stale conflict is a safe conflict message (${stale.json.error})`);
    equal(f.changedTables(printBefore, f.fingerprint()).filter(name => !NOISE.has(name)), [], `${scenario.name}: the stale request wrote nothing`);
    stales++;
  }
  // Injected failure at every written table, at the first, second and last row of multi-row inserts.
  for (const table of written) {
    const rows = added[table];
    const points = [...new Set([0, rows > 1 ? 1 : 0, Math.max(rows - 1, 0)])];
    for (const point of points) {
      const context = await scenario.setup();
      const before = f.fingerprint();
      const remove = installFault(table, point);
      let result;
      try { result = await quiet(() => run(scenario.req(context)))(); } finally { remove(); }
      check(result.status >= 400, `${scenario.name}: fault at ${table} row ${point} is refused, never reported as success (${result.status})`);
      check(!/injected|SQLITE|RAISE|trigger/i.test(result.text), `${scenario.name}: fault at ${table} leaks no database detail (${result.text.slice(0, 100)})`);
      equal(f.changedTables(before, f.fingerprint()).filter(name => !NOISE.has(name)), [], `${scenario.name}: fault at ${table} row ${point} left every table unchanged (whole-write rollback)`);
      const recovered = await run(scenario.req(context));
      check(scenario.ok.includes(recovered.status), `${scenario.name}: after fault at ${table} row ${point} the same request succeeds (${recovered.status} ${recovered.text.slice(0, 100)})`);
      failurePoints++;
    }
  }
  // Concurrency: six simultaneous requests.
  if (scenario.race) {
    const context = await scenario.setup();
    const before = counts();
    const results = await Promise.all(Array.from({ length: 6 }, () => run(scenario.req(context, uid()))));
    const winners = results.filter(result => scenario.ok.includes(result.status));
    equal(winners.length, 1, `${scenario.name}: exactly one of six concurrent competing requests wins (statuses ${results.map(result => result.status)})`);
    check(results.filter(result => !scenario.ok.includes(result.status)).every(result => result.status === 409), `${scenario.name}: every loser is a 409 conflict (statuses ${results.map(result => result.status)})`);
    const after = counts();
    for (const table of written) equal(after[table] - before[table], added[table], `${scenario.name}: ${table} gained exactly the rows of one winner under contention`);
    races++;
  }
  if (/key = ctx\.key/.test(scenario.req.toString())) {
    // Same retry key concurrently: all converge on the one original write.
    const context = await scenario.setup();
    const before = counts();
    const results = await Promise.all(Array.from({ length: 6 }, () => run(scenario.req(context))));
    check(results.every(result => scenario.ok.includes(result.status) || scenario.retry.includes(result.status)), `${scenario.name}: six identical concurrent retries all converge (statuses ${results.map(result => result.status)})`);
    check(results.some(result => scenario.ok.includes(result.status)), `${scenario.name}: at least one identical concurrent request is the original write`);
    const after = counts();
    for (const table of written) equal(after[table] - before[table], added[table], `${scenario.name}: ${table} gained exactly one write's rows from six identical concurrent requests`);
    races++;
  }
  summary.push(`${scenario.name}: tables ${written.map(name => `${name}+${added[name]}`).join(', ')}`);
}
console.log(summary.join('\n'));
console.log(`${scenarios.length} write paths, ${failurePoints} injected failure points, ${retries} exact retries, ${mismatches} retry-key clashes, ${stales} stale preconditions, ${races} concurrency groups.`);
check(failurePoints >= 50, `${failurePoints} failure points exercised`);

// ---------------------------------------------------------------------------------------------------------------
// Section 2b: whole-batch prevalidation (TC-029, TC-116): a bad second member leaves the valid first member unwritten.
// ---------------------------------------------------------------------------------------------------------------
{
  const assessment = await newAssessment();
  const day = date();
  const batches = [
    ['attendance: invalid status in the second entry', 'teacher-a', 'POST', '/api/attendance', { classId: 'class-a', date: day, entries: [{ studentId: 'student-a', status: 'present' }, { studentId: 'student-peer', status: 'bogus' }] }, [400]],
    ['attendance: second pupil in another school', 'teacher-a', 'POST', '/api/attendance', { classId: 'class-a', date: day, entries: [{ studentId: 'student-a', status: 'present' }, { studentId: 'student-b', status: 'present' }] }, [400, 403, 404]],
    ['attendance: second pupil not in the class', 'teacher-a', 'POST', '/api/attendance', { classId: 'class-a', date: day, entries: [{ studentId: 'student-a', status: 'present' }, { studentId: 'student-other', status: 'present' }] }, [400, 403, 404]],
    ['attendance: duplicate pupil', 'teacher-a', 'POST', '/api/attendance', { classId: 'class-a', date: day, entries: [{ studentId: 'student-a', status: 'present' }, { studentId: 'student-a', status: 'absent' }] }, [400]],
    ['results: second score above the maximum', 'teacher-a', 'POST', `/api/assessments/${assessment.id}/results`, { results: [{ studentId: 'student-a', score: 3 }, { studentId: 'student-peer', score: 99 }] }, [400]],
    ['results: second pupil not in the class', 'teacher-a', 'POST', `/api/assessments/${assessment.id}/results`, { results: [{ studentId: 'student-a', score: 3 }, { studentId: 'student-other', score: 4 }] }, [400, 403, 404]],
    ['results: duplicate pupil', 'teacher-a', 'POST', `/api/assessments/${assessment.id}/results`, { results: [{ studentId: 'student-a', score: 3 }, { studentId: 'student-a', score: 4 }] }, [400]],
    ['reviewed attendance: second entry invalid', 'teacher-a', 'POST', '/api/classes/class-a/attendance-editor', { date: day, clientRequestId: uid(), reviewConfirmed: true, reason: 'Synthetic reviewed attendance change.', entries: [{ studentId: 'student-a', status: 'present', note: null, expectedRecord: null }, { studentId: 'student-peer', status: 'bogus', note: null, expectedRecord: null }] }, [400]],
  ];
  for (const [name, actor, method, path, body, statuses] of batches) {
    const before = f.fingerprint();
    const result = await f.call(actor, method, path, { body });
    check(statuses.includes(result.status), `${name}: refused with ${statuses} (got ${result.status} ${result.text.slice(0, 80)})`);
    equal(f.changedTables(before, f.fingerprint()).filter(name => !NOISE.has(name)), [], `${name}: the valid first member was not written`);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Section 3: first-use synthetic demo installation is atomic (own empty database).
// ---------------------------------------------------------------------------------------------------------------
{
  const installation = '908df258-dff2-43d4-a540-503b2c7e7d13';
  const configure = () => { for (const key of ['SAHA_OIDC_ISSUER', 'SAHA_OIDC_CLIENT_ID', 'SAHA_OIDC_CLIENT_SECRET', 'SAHA_OIDC_REDIRECT_URL', 'SAHA_OIDC_TOKEN_AUTH_METHOD']) delete bindings[key]; bindings.SAHA_DEMO_ENABLED = 'true'; bindings.SAHA_DEMO_INSTALLATION_ID = installation; bindings.SAHA_ALLOWED_ORIGINS = origin; };
  const demo = (database, body = { role: 'teacher', syntheticAcknowledged: true }) => dispatch(new Request(origin + '/api/demo', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  configure();
  const first = freshDatabase();
  const empty = Object.fromEntries(first.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => [row.name, 0]));
  const ok = await demo(first);
  equal(ok.status, 200, 'demo first-use installs and signs in');
  const rowCounts = db => Object.fromEntries(Object.keys(empty).map(name => [name, db.sqlite.prepare(`SELECT count(*) n FROM "${name}"`).get().n]));
  const installed = rowCounts(first);
  const seeded = Object.keys(installed).filter(name => installed[name] > 0 && !NOISE.has(name));
  check(seeded.length >= 12, `demo installation writes ${seeded.length} tables (${seeded.join(', ')})`);
  let demoPoints = 0;
  for (const table of seeded) {
    for (const point of [0, installed[table] > 1 ? installed[table] - 1 : 0]) {
      const database = freshDatabase();
      configure();
      const base = 0;
      database.sqlite.exec(`CREATE TRIGGER inj_demo BEFORE INSERT ON "${table}" WHEN (SELECT count(*) FROM "${table}") >= ${base + point} BEGIN SELECT RAISE(ABORT,'injected failure'); END`);
      const failed = await quiet(() => demo(database))();
      check(failed.status >= 400, `demo install with a fault at ${table} row ${point} is refused (${failed.status})`);
      const leaked = await failed.text();
      check(!/injected|SQLITE|trigger/i.test(leaked), 'demo failure leaks no database detail');
      const after = rowCounts(database);
      equal(Object.keys(after).filter(name => !NOISE.has(name) && after[name] !== 0), [], `demo install with a fault at ${table} row ${point} left the database empty (no partial synthetic school)`);
      database.sqlite.exec('DROP TRIGGER inj_demo');
      equal((await demo(database)).status, 200, `demo install succeeds on retry after the fault at ${table} row ${point}`);
      demoPoints++;
    }
  }
  console.log(`Demo installation: ${demoPoints} injected failure points.`);
  // Concurrent first use: exactly one installation, every caller signed in.
  const raced = freshDatabase();
  configure();
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => demo(raced)));
  check(outcomes.every(response => response.status === 200), `five concurrent first-use sign-ins all succeed (${outcomes.map(response => response.status)})`);
  equal([raced.sqlite.prepare('SELECT count(*) n FROM schools').get().n, raced.sqlite.prepare('SELECT count(*) n FROM demo_installations').get().n], [1, 1], 'concurrent first use installs exactly one demonstration school and marker');
  for (const key of ['SAHA_DEMO_ENABLED', 'SAHA_DEMO_INSTALLATION_ID']) delete bindings[key];
}

check(externalRequests === 0, `no external request (${externalRequests})`);
globalThis.fetch = realFetch;
console.log(`Atomicity and concurrency: ${checks} checks passed (real handlers, synthetic SQLite, offline).`);
console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
