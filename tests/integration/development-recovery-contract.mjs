// Disposable local encrypted snapshot/restore using the existing operator
// helper. This does not validate deployed D1 export, cutover, backup schedules,
// operational key custody, retention, or recovery of real student records.
import assert from 'node:assert/strict';
import { DatabaseSync, backup } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { createBackup, restoreBackup, inventory } from '../../scripts/recovery.mjs';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const sourceDb = globalThis.__sahaTestDb;
const directory = mkdtempSync(join(tmpdir(), 'saha-development-recovery-'));
const sourcePath = join(directory, 'source.sqlite');
const backupPath = join(directory, 'snapshot.encrypted.json');
const restoredPath = join(directory, 'restored.sqlite');
const passphrase = randomBytes(32).toString('base64url');
let restored;
let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessionService = await load('lib/education/session.ts');
const routes = {
  users: await load('app/api/admin/users/route.ts'), profiles: await load('app/api/admin/profile-links/route.ts'),
  profileHistory: await load('app/api/admin/profile-links/history/route.ts'),
  imports: await load('app/api/reading-imports/route.ts'), importDetail: await load('app/api/reading-imports/[id]/route.ts'),
  importDecision: await load('app/api/reading-imports/[id]/decision/route.ts'),
  attempts: await load('app/api/assignments/[id]/submissions/route.ts'),
  feedback: await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts'),
  window: await load('app/api/assignments/[id]/submission-window/route.ts'),
  reports: await load('app/api/report-cards/route.ts'),
  report: await load('app/api/report-cards/[id]/route.ts'),
  notices: await load('app/api/notifications/route.ts'),
  attendanceEditor: await load('app/api/classes/[id]/attendance-editor/route.ts'),
  attendanceHistory: await load('app/api/classes/[id]/attendance-editor/history/route.ts'),
  resultEditor: await load('app/api/assessments/[id]/result-editor/route.ts'),
  resultHistory: await load('app/api/assessments/[id]/result-editor/history/route.ts'),
};
const curriculum = await load('lib/education/curriculum.ts');
const resources = await load('lib/education/resources.ts');
const readings = await load('lib/education/reading-checks.ts');
const readingReview = await load('lib/education/reading-review.ts');
const enrolments = await load('lib/education/enrolments.ts');
const attendance = await load('lib/education/attendance.ts');
const assessments = await load('lib/education/assessments.ts');
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
const admin = { id: 'admin-a', role: 'admin', schoolId: 'a' };
const cookies = {};
for (const user of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) cookies[user] = (await sessionService.createSession(user)).split(';')[0];
function request(user, method = 'GET', payload, path = '/api/recovery', suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin, ...(cookies[user] ? { cookie: cookies[user] } : {}) };
  return new Request(origin + path, { method, headers: { ...headers, ...(payload !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });
}
const params = (id, submissionId) => ({ params: Promise.resolve({ id, ...(submissionId ? { submissionId } : {}) }) });
async function json(response, status, message) { check(response.status, status, message); check(response.headers.get('cache-control'), 'no-store', 'Private recovery fixture route stays uncached'); return response.json(); }
function count(database, table) { return database.prepare(`SELECT count(*) n FROM "${table.replaceAll('"', '""')}"`).get().n; }
function databaseSnapshot(database) {
  const objects = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') ORDER BY type,name").all();
  const tables = {};
  for (const object of objects.filter(object => object.type === 'table')) {
    tables[object.name] = database.prepare(`SELECT * FROM "${object.name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort();
  }
  return { objects, tables };
}
function proxyFor(database) {
  function execute(query, parameters, method) {
    const statement = database.prepare(query);
    if (method === 'run') { statement.run(...parameters); return { rows: [] }; }
    statement.setReturnArrays(true);
    if (method === 'get') return { rows: statement.get(...parameters) ?? undefined };
    return { rows: statement.all(...parameters) };
  }
  return drizzle(async (...args) => execute(...args), async queries => {
    database.exec('BEGIN');
    try { const results = queries.map(query => execute(query.sql, query.params, query.method)); database.exec('COMMIT'); return results; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }, { schema });
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Local development recovery must not contact providers or recipients'); };
try {
  const provisionInputs = ['student', 'guardian'].map(role => ({ clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
    name: 'Synthetic recovery ' + role, email: `recovery-${role}@example.invalid`, role,
    identityIssuer: 'https://identity.example.invalid', identitySubject: 'synthetic-recovery-' + role,
    reason: 'Reviewed synthetic account for local recovery verification.' }));
  const provisioned = [];
  for (const input of provisionInputs) provisioned.push(await json(await routes.users.POST(request('admin-a', 'POST', input)), 201, 'Reviewed recovery identity provisioned through actual route'));
  const profileInputs = provisioned.map((created, index) => ({ profileType: index === 0 ? 'student' : 'guardian',
    profileId: index === 0 ? 'student-other' : 'guardian-profile-other', userId: created.user.id, expectedVersion: 0,
    clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Reviewed synthetic replacement mapping for local recovery.' }));
  const profileDecisions = [];
  for (const input of profileInputs) profileDecisions.push(await json(await routes.profiles.POST(request('admin-a', 'POST', input)), 200, 'Reviewed profile mapping saved through actual route'));
  check(count(sqlite, 'profile_link_events'), 2, 'Source has two attributable profile reviews');
  check(count(sqlite, 'student_guardians'), 3, 'Reviewed identity links retain confirmed family relationships');

  const sourceContent = { title: 'Synthetic recovery reference', curriculum: 'Synthetic test curriculum', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN',
    objectives: 'Compare synthetic fractions.', body: 'Explain one synthetic fraction comparison.', rightsStatement: 'Original synthetic recovery text declared by the test educator.',
    sourceReference: 'Synthetic local author', sourceUrl: null };
  const curriculumInput = { clientReferenceId: crypto.randomUUID(), content: sourceContent };
  const reference = await curriculum.createCurriculumReference(teacher, curriculumInput);
  await curriculum.approveCurriculumReference(teacher, reference.id, { versionId: reference.latest.id, confirmReview: true });
  const copyInput = { clientResourceId: crypto.randomUUID(), type: 'worksheet', versionId: reference.latest.id };
  const copied = await curriculum.copyCurriculumToDraft(teacher, reference.id, copyInput);
  await resources.approveResource(teacher, copied.resource.id, copied.resource.latest.id);
  const assignment = await resources.assignResource(teacher, copied.resource.id, { classId: 'class-a', versionId: copied.resource.latest.id });
  const openWindow = { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'open', closesAt: null,
    reviewConfirmed: true, reason: 'Reviewed synthetic open submission window for recovery.' };
  const opened = await json(await routes.window.POST(request('teacher-a', 'POST', openWindow), params(assignment.id)), 201, 'Reviewed open window saved before original attempts');
  check(opened.window.acceptingSubmissions, true, 'Fixture window explicitly accepts original attempts');
  const attemptInputs = [0, 1].map(expectedAttempt => ({ clientSubmissionId: crypto.randomUUID(), expectedAttempt, response: `Synthetic original learner attempt ${expectedAttempt + 1}.` }));
  const attempts = [];
  for (const input of attemptInputs) attempts.push(await json(await routes.attempts.POST(request('student-user-a', 'POST', input), params(assignment.id)), 201, 'Original learner text attempt persisted'));
  const feedbackInputs = [0, 1].map(expectedRevision => ({ clientFeedbackId: crypto.randomUUID(), expectedRevision, reviewed: true, feedback: `Synthetic exact-attempt reviewed feedback ${expectedRevision + 1}.` }));
  const reviews = [];
  for (const input of feedbackInputs) reviews.push(await json(await routes.feedback.POST(request('teacher-a', 'POST', input), params(assignment.id, attempts[0].id)), 201, 'Reviewed formative feedback revision persisted'));
  const closedWindow = { ...openWindow, clientPolicyId: crypto.randomUUID(), expectedRevision: 1, state: 'closed', reason: 'Reviewed synthetic closed window retains original recovery evidence.' };
  const closed = await json(await routes.window.POST(request('teacher-a', 'POST', closedWindow), params(assignment.id)), 201, 'Reviewed closure saved after original attempts');
  check(closed.window.acceptingSubmissions, false, 'Recovery source stores a closed window with prior attempts intact');

  const today = new Date().toISOString().slice(0, 10);
  const observed = { clientCheckId: crypto.randomUUID(), classId: 'class-a', studentId: 'student-a', language: 'en-IN', passageReference: 'Synthetic recovery passage',
    readingDate: today, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 90 };
  const originalReading = await readings.createReadingCheck(teacher, observed);
  const correctionInput = { clientCorrectionId: crypto.randomUUID(), expectedRevision: 0, confirmReviewed: true,
    reason: 'Reviewed synthetic reading count correction for recovery.', language: observed.language, passageReference: observed.passageReference,
    readingDate: today, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 89 };
  const correction = await readingReview.appendReadingCorrection(teacher, originalReading.id, correctionInput);
  const importEnvelope = { format: 'saha.reading-results.v1', classId: 'class-a', sourceLabel: 'Synthetic recovery declared namespace', sourceReference: 'Synthetic local reviewed export',
    rows: [1, 2].map(number => ({ externalReference: 'synthetic-recovery-source-' + number, studentId: 'student-a', language: 'en-IN',
      passageReference: 'Synthetic imported recovery passage', readingDate: today, durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 90 - number })) };
  const importInput = { clientImportId: crypto.randomUUID(), envelope: importEnvelope };
  const decisionInput = { clientDecisionId: crypto.randomUUID(), expectedRevision: 0, action: 'confirm', confirmReviewed: true, reason: 'Educator reviewed synthetic local source rows for recovery.' };
  const staged = await json(await routes.imports.POST(request('teacher-a', 'POST', importInput)), 201, 'Reading import staged through actual route');
  const confirmed = await json(await routes.importDecision.POST(request('teacher-a', 'POST', decisionInput), params(staged.draft.id)), 200, 'Reading import confirmed atomically before snapshot');
  const rejectedInput = { clientImportId: crypto.randomUUID(), envelope: { ...importEnvelope, sourceLabel: 'Synthetic recovery rejected namespace' } };
  const rejectedDraft = await json(await routes.imports.POST(request('teacher-a', 'POST', rejectedInput)), 201, 'Separate import staged for explicit rejection');
  const rejectedDecision = { ...decisionInput, clientDecisionId: crypto.randomUUID(), action: 'reject', reason: 'Educator rejected synthetic rows without recording observations.' };
  const rejected = await json(await routes.importDecision.POST(request('teacher-a', 'POST', rejectedDecision), params(rejectedDraft.draft.id)), 200, 'Rejected import evidence retained before snapshot');
  const pendingInput = { clientImportId: crypto.randomUUID(), envelope: { ...importEnvelope, sourceLabel: 'Synthetic recovery pending namespace' } };
  const pending = await json(await routes.imports.POST(request('teacher-a', 'POST', pendingInput)), 201, 'Unreviewed import retained before snapshot');
  check(count(sqlite, 'reading_import_drafts'), 3, 'Source retains confirmed/rejected/staged import lifecycle evidence');
  check(count(sqlite, 'reading_import_receipts'), 2, 'Only confirmed source items have receipts');
  check(count(sqlite, 'reading_checks'), 3, 'Source retains original plus two reviewed imported observations');
  await enrolments.enrolStudent(admin, 'student-other', 'class-a');
  await attendance.markAttendance(teacher, 'class-a', today, [{ studentId: 'student-a', status: 'present' }, { studentId: 'student-other', status: 'late' }], 'teacher-a');
  await assessments.recordResults(teacher, 'assessment-a', [{ studentId: 'student-a', score: 7, grade: 'Synthetic supplied', feedback: 'Confirmed synthetic result' }, { studentId: 'student-other', score: 8 }]);
  const publication = await json(await routes.report.PATCH(request('admin-a', 'PATCH', { publish: true }), params('draft-a')), 200, 'Source publishes an actual report before encrypted snapshot');
  check(count(sqlite, 'report_publication_receipts'), 1, 'Source has one attributable publication receipt');
  const publicationReceipt = sqlite.prepare('SELECT * FROM report_publication_receipts WHERE report_id=?').get('draft-a');
  const publicationNoticeId = 'report-card-published:draft-a:guardian-a';
  check(sqlite.prepare('SELECT count(*) n FROM notifications WHERE id=?').get(publicationNoticeId).n, 1, 'Source has exactly one current linked guardian notice');

  const savedMarks = await json(await routes.attendanceEditor.GET(request('teacher-a', 'GET', undefined,
    '/api/classes/class-a/attendance-editor?date=' + today), params('class-a')), 200, 'Saved attendance snapshot loads before encrypted recovery');
  const priorMark = savedMarks.roster.items.find(row => row.student.id === 'student-a').record;
  const attendanceReviewInput = { date: today, clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
    reason: 'Reviewed synthetic saved absence for recovery verification.',
    entries: [{ studentId: 'student-a', status: 'absent', note: 'Synthetic reviewed recovery explanation', expectedRecord: priorMark }] };
  const attendanceReview = await json(await routes.attendanceEditor.POST(request('teacher-a', 'POST', attendanceReviewInput), params('class-a')),
    201, 'Reviewed saved attendance and exact before/after evidence commit before encrypted snapshot');
  check(attendanceReview.review.changes[0].beforeRecord, priorMark, 'Source review binds the exact existing saved mark');
  check(attendanceReview.review.changes[0].afterRecord.status, 'absent', 'Source review saves the explicitly chosen absence');
  check(count(sqlite, 'attendance_reviews'), 1, 'Source has one immutable attendance review');
  check(count(sqlite, 'attendance_review_entries'), 1, 'Source has one attributable attendance change');
  const resultSnapshot = await json(await routes.resultEditor.GET(request('teacher-a'), params('assessment-a')), 200,
    'Saved result snapshot loads before encrypted recovery');
  const priorResult = resultSnapshot.roster.items.find(row => row.student.id === 'student-a').record;
  const resultReviewInput = { clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
    reason: 'Educator reviewed synthetic zero score before encrypted recovery.', expectedAssessment: resultSnapshot.assessment,
    entries: [{ studentId: 'student-a', score: 0, grade: null, feedback: '', expectedRecord: priorResult }] };
  const resultReview = await json(await routes.resultEditor.POST(request('teacher-a', 'POST', resultReviewInput), params('assessment-a')),
    201, 'Reviewed saved result and before/after evidence commit before encrypted snapshot');
  check(resultReview.review.changes[0].beforeRecord, priorResult, 'Source result review binds exact original evidence');
  check(resultReview.review.changes[0].afterRecord.score, 0, 'Source review preserves explicit zero score');
  check(count(sqlite, 'assessment_reviews'), 1, 'Source has one immutable result review');
  check(count(sqlite, 'assessment_review_entries'), 1, 'Source has one attributable result change');

  const before = databaseSnapshot(sqlite);
  check(sqlite.prepare('PRAGMA foreign_key_check').all(), [], 'Populated source has no foreign-key violations');
  check(sqlite.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', 'Populated source passes SQLite integrity check');
  await backup(sqlite, sourcePath);
  const backupResult = await createBackup(sourcePath, backupPath, passphrase);
  const encrypted = JSON.parse(readFileSync(backupPath, 'utf8'));
  check(Object.hasOwn(encrypted, 'database'), false, 'Stored local encrypted envelope contains no plaintext database field');
  check(readFileSync(backupPath, 'utf8').includes(attemptInputs[0].response), false, 'Original learner text is absent from stored encrypted envelope');
  await assert.rejects(() => restoreBackup(backupPath, join(directory, 'wrong-secret.sqlite'), randomBytes(32).toString('base64url'))); checks++;
  check(existsSync(join(directory, 'wrong-secret.sqlite')), false, 'Incorrect local passphrase creates no restored database');
  const restoredResult = await restoreBackup(backupPath, restoredPath, passphrase);
  check(restoredResult.verified, true, 'Existing helper verifies restored schema/table manifest and digest');
  check(restoredResult.sha256, backupResult.sha256, 'Encrypted snapshot roundtrip preserves actual SQLite bytes');
  check(inventory(restoredPath), inventory(sourcePath), 'Independent helper inventory matches every table digest and explicit schema object');
  restored = new DatabaseSync(restoredPath);
  restored.exec('PRAGMA foreign_keys=ON');
  const after = databaseSnapshot(restored);
  check(after.objects, before.objects, 'Every table, named/automatic index, view and trigger survives actual restore');
  for (const [table, rows] of Object.entries(before.tables)) check(after.tables[table], rows, `${table} retains all exact IDs, references and fields`);
  check(restored.prepare('PRAGMA foreign_key_check').all(), [], 'Restored populated database has no foreign-key violations');
  check(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', 'Restored populated database passes SQLite integrity check');
  globalThis.__sahaTestDb = proxyFor(restored);

  const preservedCounts = Object.fromEntries(['assessment_reviews', 'assessment_review_entries', 'assessment_results', 'attendance_reviews', 'attendance_review_entries', 'attendance', 'report_publication_receipts', 'report_cards', 'notifications', 'identity_admin_events', 'profile_link_events', 'profile_link_versions', 'reading_import_drafts', 'reading_import_items',
    'reading_import_receipts', 'reading_checks', 'reading_corrections', 'assignment_submission_windows', 'submission_attempts', 'submission_feedback',
    'curriculum_references', 'curriculum_reference_versions', 'resource_reference_bindings', 'teaching_resources', 'resource_versions'].map(table => [table, count(restored, table)]));
  for (let index = 0; index < profileInputs.length; index++) {
    const replay = await json(await routes.profiles.POST(request('admin-a', 'POST', profileInputs[index])), 200, 'Exact reviewed profile UUID replay works after restore');
    check(replay, profileDecisions[index], 'Restored profile replay retains decision identity, actor, timestamp and mapping');
  }
  const stageReplay = await json(await routes.imports.POST(request('teacher-a', 'POST', importInput)), 201, 'Exact stage UUID replay works after restore');
  check(stageReplay, confirmed, 'Restored stage replay returns established decision/items/receipt identities');
  const confirmReplay = await json(await routes.importDecision.POST(request('teacher-a', 'POST', decisionInput), params(confirmed.draft.id)), 200, 'Exact confirmation UUID replay works after restore');
  check(confirmReplay, confirmed, 'Restored confirmation retains original receipts and reviewed timestamp');
  const rejectReplay = await json(await routes.importDecision.POST(request('teacher-a', 'POST', rejectedDecision), params(rejected.draft.id)), 200, 'Exact rejection UUID replay works after restore');
  check(rejectReplay, rejected, 'Restored rejection retains evidence without inventing readings');
  const attemptReplay = await json(await routes.attempts.POST(request('student-user-a', 'POST', attemptInputs[0]), params(assignment.id)), 201, 'Established attempt UUID can replay after restored window closure');
  check(attemptReplay.id, attempts[0].id, 'Attempt replay retains exact original attempt ID');
  check(attemptReplay.response, attempts[0].response, 'Attempt replay retains exact original text');
  check(attemptReplay.feedback.map(row => row.id), reviews.map(row => row.id).reverse(), 'Attempt replay returns exact reviewed feedback history');
  for (let index = 0; index < feedbackInputs.length; index++) {
    const replay = await json(await routes.feedback.POST(request('teacher-a', 'POST', feedbackInputs[index]), params(assignment.id, attempts[0].id)), 201, 'Exact formative-feedback UUID replay works after restore');
    check(replay, reviews[index], 'Restored feedback retains immutable reviewer/revision/content/timestamp');
  }
  const windowReplay = await json(await routes.window.POST(request('teacher-a', 'POST', closedWindow), params(assignment.id)), 201, 'Exact window review UUID replay works after restore');
  check(windowReplay.review, closed.review, 'Restored window replay retains exact review identity and reason');
  check(windowReplay.window.acceptingSubmissions, false, 'Restored window still blocks new attempts');
  check(await readingReview.appendReadingCorrection(teacher, originalReading.id, correctionInput), correction, 'Restored correction UUID replay retains original attributable correction');
  check((await curriculum.createCurriculumReference(teacher, curriculumInput)).id, reference.id, 'Restored curriculum source UUID replay preserves original source');
  check(await curriculum.copyCurriculumToDraft(teacher, reference.id, copyInput), { resource: { ...copied.resource, latest: { ...copied.resource.latest, approvedBy: 'teacher-a', approvedAt: restored.prepare('SELECT approved_at FROM resource_versions WHERE id=?').get(copied.resource.latest.id).approved_at } }, provenance: copied.provenance }, 'Restored approved-source copy retry preserves durable provenance and current approval evidence');
  const publicationReplay = await json(await routes.report.PATCH(request('admin-a', 'PATCH', { publish: true }), params('draft-a')), 200, 'Restored publication retry uses actual session-backed route');
  check(publicationReplay, publication, 'Restored publication retains original report fields and timestamp');
  check(restored.prepare('SELECT * FROM report_publication_receipts WHERE report_id=?').get('draft-a'), publicationReceipt, 'Restored retry preserves exact publication receipt');
  const restoredNotices = await json(await routes.notices.GET(request('guardian-a')), 200, 'Restored guardian reads own original notice');
  check(restoredNotices.filter(row => row.id === publicationNoticeId).length, 1, 'Restored publication replay appends no duplicate notice');
  const attendanceReplay = await json(await routes.attendanceEditor.POST(request('teacher-a', 'POST', attendanceReviewInput), params('class-a')),
    200, 'Exact attendance review UUID replays after actual encrypted restore');
  check(attendanceReplay.replayed, true, 'Restored retry is identified as the original committed review');
  check(attendanceReplay.review, attendanceReview.review, 'Restored review retains exact ID, actor, reason, time and before/after evidence');
  const attendanceHistory = await json(await routes.attendanceHistory.GET(request('teacher-a', 'GET', undefined,
    '/api/classes/class-a/attendance-editor/history?date=' + today), params('class-a')), 200, 'Restored staff attendance history remains readable');
  check(attendanceHistory.items, [attendanceReview.review], 'Restored history contains exactly the original reviewed outcome');
  const restoredMarks = await json(await routes.attendanceEditor.GET(request('teacher-a', 'GET', undefined,
    '/api/classes/class-a/attendance-editor?date=' + today), params('class-a')), 200, 'Restored current saved attendance can be checked separately from a receipt');
  check(restoredMarks.roster.items.find(row => row.student.id === 'student-a').record,
    attendanceReview.review.changes[0].afterRecord, 'Exact retry did not alter the restored saved mark');
  const resultReplay = await json(await routes.resultEditor.POST(request('teacher-a', 'POST', resultReviewInput), params('assessment-a')),
    200, 'Exact result review UUID replays after actual encrypted restore');
  check(resultReplay.replayed, true, 'Restored result retry is the original committed review');
  check(resultReplay.review, resultReview.review, 'Restored result receipt retains exact original metadata and before/after values');
  const resultHistory = await json(await routes.resultHistory.GET(request('teacher-a'), params('assessment-a')), 200,
    'Restored staff can read result review history');
  check(resultHistory.items, [resultReview.review], 'Restored result history contains the original decision');
  const restoredResults = await json(await routes.resultEditor.GET(request('teacher-a'), params('assessment-a')), 200,
    'Restored current result snapshot is separate from original receipt');
  check(restoredResults.roster.items.find(row => row.student.id === 'student-a').record, resultReview.review.changes[0].afterRecord,
    'Exact result retry preserves the restored saved score/grade/feedback');
  check(Object.fromEntries(Object.keys(preservedCounts).map(table => [table, count(restored, table)])), preservedCounts, 'All exact UUID retries append no duplicate evidence after restore');

  const guards = [
    ["UPDATE assessment_reviews SET reason='Changed reviewed result' WHERE id=?", resultReview.review.id],
    ['DELETE FROM assessment_reviews WHERE id=?', resultReview.review.id],
    ["UPDATE assessment_review_entries SET after_record='{}' WHERE review_id=?", resultReview.review.id],
    ['DELETE FROM assessment_review_entries WHERE review_id=?', resultReview.review.id],
    ["UPDATE attendance_reviews SET reason='Changed reviewed reason' WHERE id=?", attendanceReview.review.id],
    ['DELETE FROM attendance_reviews WHERE id=?', attendanceReview.review.id],
    ["UPDATE attendance_review_entries SET after_record='{}' WHERE review_id=?", attendanceReview.review.id],
    ['DELETE FROM attendance_review_entries WHERE review_id=?', attendanceReview.review.id],
    ["UPDATE report_publication_receipts SET published_at='Changed timestamp' WHERE id=?", publicationReceipt.id],
    ['DELETE FROM report_publication_receipts WHERE id=?', publicationReceipt.id],
    ["UPDATE profile_link_events SET reason='Changed recovery reason' WHERE id=?", profileDecisions[0].event.id],
    ['DELETE FROM profile_link_events WHERE id=?', profileDecisions[0].event.id],
    ["UPDATE assignment_submission_windows SET state='open' WHERE id=?", closed.review.id],
    ['DELETE FROM assignment_submission_windows WHERE id=?', closed.review.id],
    ["UPDATE reading_import_drafts SET source_label='Changed recovery source' WHERE id=?", confirmed.draft.id],
    ['DELETE FROM reading_import_drafts WHERE id=?', confirmed.draft.id],
    ["UPDATE reading_import_drafts SET source_label='Changed staged source' WHERE id=?", pending.draft.id],
    ['UPDATE reading_import_items SET words_correct=1 WHERE id=?', confirmed.items[0].id],
    ['DELETE FROM reading_import_items WHERE id=?', confirmed.items[0].id],
    ["UPDATE reading_import_receipts SET source_label='Changed recovery source' WHERE item_id=?", confirmed.items[0].id],
    ['DELETE FROM reading_import_receipts WHERE item_id=?', confirmed.items[0].id],
    ["UPDATE reading_corrections SET reason='Changed correction' WHERE id=?", correction.id],
    ['DELETE FROM reading_corrections WHERE id=?', correction.id],
  ];
  for (const [statement, id] of guards) { assert.throws(() => restored.prepare(statement).run(id), /immutable/i); checks++; }
  for (const [table, columns] of [
    ['submission_attempts', 'assignment_id,version_id,student_id,submitted_by,attempt,response,created_at'],
    ['submission_feedback', 'submission_id,revision,feedback,reviewed_by,reviewed_at'],
    ['assignment_submission_windows', 'assignment_id,revision,state,closes_at,reviewed_by,reviewed_at,reason,request_hash'],
    ['profile_link_events', 'school_id,actor_id,profile_type,profile_id,student_id,guardian_id,previous_user_id,next_user_id,expected_version,resulting_version,reason,reviewed_at,request_hash,attempt_id'],
  ]) { assert.throws(() => restored.prepare(`INSERT INTO ${table}(id,${columns}) SELECT ?,${columns} FROM ${table} LIMIT 1`).run(crypto.randomUUID()), /UNIQUE constraint failed/i); checks++; }
  assert.throws(() => restored.prepare('INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) SELECT ?,student_id,class_id,status,enrolled_at,created_at,updated_at FROM enrolments LIMIT 1').run(crypto.randomUUID()), /saha_enrolment_pair_conflict/); checks++;
  assert.throws(() => restored.prepare('INSERT INTO assessment_results(id,assessment_id,student_id,score,grade,feedback,created_at,updated_at) SELECT ?,assessment_id,student_id,score,grade,feedback,created_at,updated_at FROM assessment_results LIMIT 1').run(crypto.randomUUID()), /saha_result_pair_conflict/); checks++;
  assert.throws(() => restored.prepare('INSERT INTO attendance(id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at) SELECT ?,class_id,student_id,date,status,note,recorded_by,created_at,updated_at FROM attendance LIMIT 1').run(crypto.randomUUID()), /UNIQUE constraint failed/i); checks++;
  assert.throws(() => restored.prepare('INSERT INTO guardians(id,school_id,user_id,name,relationship,created_at,updated_at) SELECT ?,school_id,user_id,name,relationship,created_at,updated_at FROM guardians WHERE user_id IS NOT NULL LIMIT 1').run(crypto.randomUUID()), /Guardian login already linked/); checks++;
  check(databaseSnapshot(restored).tables, before.tables, 'Restored guard failures and exact retries preserve every original table row');

  for (const user of ['guardian-a', 'student-user-a', 'teacher-a']) check((await routes.profiles.GET(request(user))).status, 403, 'Restored profile review evidence retains admin-only privacy');
  check((await routes.profileHistory.GET(request('admin-b'))).status, 200, 'Restored foreign admin history is safely scoped');
  check(await (await routes.profileHistory.GET(request('admin-b'))).json(), [], 'Restored foreign admin receives no profile review reasons');
  check((await routes.importDetail.GET(request('admin-b'), params(confirmed.draft.id))).status, 404, 'Restored import receipts remain school scoped');
  check((await routes.importDetail.GET(request('teacher-other'), params(confirmed.draft.id))).status, 404, 'Restored teacher cannot read another staff import');
  check((await routes.imports.GET(request('guardian-a'))).status, 403, 'Restored import source values remain private to staff');
  check((await routes.attempts.GET(request('guardian-a'), params(assignment.id))).status, 403, 'Restored learner attempts are not published to guardians');
  check((await routes.attempts.POST(request('student-user-a', 'POST', { ...attemptInputs[1], expectedAttempt: 2, clientSubmissionId: crypto.randomUUID() }), params(assignment.id))).status, 409, 'Closed restored window denies genuinely new learner attempt');
  check(count(restored, 'submission_attempts'), 2, 'Window denial retains both original attempts');

  const duplicateInput = { clientImportId: crypto.randomUUID(), envelope: importEnvelope };
  const duplicate = await json(await routes.imports.POST(request('teacher-a', 'POST', duplicateInput)), 201, 'Restored source can stage a duplicate for explicit review');
  const checksBeforeConflict = count(restored, 'reading_checks'), receiptsBeforeConflict = count(restored, 'reading_import_receipts');
  check((await routes.importDecision.POST(request('teacher-a', 'POST', { ...decisionInput, clientDecisionId: crypto.randomUUID() }), params(duplicate.draft.id))).status, 409, 'Restored consumption receipt prevents duplicate reviewed source readings');
  check(count(restored, 'reading_checks'), checksBeforeConflict, 'Restored receipt conflict rolls back every tentative reading');
  check(count(restored, 'reading_import_receipts'), receiptsBeforeConflict, 'Restored receipt conflict appends no partial receipt');
  check(restored.prepare('SELECT status FROM reading_import_drafts WHERE id=?').get(duplicate.draft.id).status, 'staged', 'Restored failed confirmation leaves original pending decision state');
  const continuedDecision = { ...decisionInput, clientDecisionId: crypto.randomUUID(), reason: 'Reviewed synthetic pending import after successful local restore.' };
  const continued = await json(await routes.importDecision.POST(request('teacher-a', 'POST', continuedDecision), params(pending.draft.id)), 200, 'Restored staging/confirmation triggers support continued authorized work');
  check(continued.draft.status, 'confirmed', 'Restored pending draft receives explicit confirmed outcome');
  check(continued.items.every(item => item.receipt?.readingCheckId === item.readingCheckId), true, 'Every continued source item binds its exact new reading receipt');
  check(count(restored, 'reading_checks'), checksBeforeConflict + 2, 'Continuation creates exactly the pending two observations');
  check(count(restored, 'reading_import_receipts'), receiptsBeforeConflict + 2, 'Continuation creates exactly the pending two receipts');
  check(await json(await routes.importDecision.POST(request('teacher-a', 'POST', continuedDecision), params(pending.draft.id)), 200, 'Post-restore continued decision retry succeeds'), continued, 'Continued decision retry retains exact one reviewed result');
  // Distinct drafts competing for one previously unconsumed declared source
  // are separate from the existing same-draft decision CAS contract.
  const competingSource = { ...importEnvelope, sourceLabel: 'Synthetic restored concurrent source' };
  const competitors = [];
  for (let index = 0; index < 2; index++) competitors.push(await json(await routes.imports.POST(request('teacher-a', 'POST', { clientImportId: crypto.randomUUID(), envelope: competingSource })), 201, 'Separate restored draft staged for source-consumption race'));
  const raceChecksBefore = count(restored, 'reading_checks'), raceReceiptsBefore = count(restored, 'reading_import_receipts');
  const sourceRace = await Promise.all(competitors.map(draft => routes.importDecision.POST(request('teacher-a', 'POST', { ...decisionInput, clientDecisionId: crypto.randomUUID() }), params(draft.draft.id))));
  check(sourceRace.map(response => response.status).sort(), [200, 409], 'Concurrent distinct imports consume declared source exactly once');
  check(count(restored, 'reading_checks'), raceChecksBefore + 2, 'Distinct-source race records only one complete observation batch');
  check(count(restored, 'reading_import_receipts'), raceReceiptsBefore + 2, 'Distinct-source race retains only one complete receipt batch');
  check(competitors.map(draft => restored.prepare('SELECT status FROM reading_import_drafts WHERE id=?').get(draft.draft.id).status).sort(), ['confirmed', 'staged'], 'Losing duplicate-source draft remains staged without erasing evidence');
  check(restored.prepare('SELECT count(*) n FROM reading_import_receipts WHERE source_label=?').get(competingSource.sourceLabel).n, 2, 'Declared source has exactly one receipt for each original source reference');

  const sharedDecisionDrafts = [];
  for (let index = 0; index < 2; index++) sharedDecisionDrafts.push(await json(await routes.imports.POST(request('teacher-a', 'POST', { clientImportId: crypto.randomUUID(),
    envelope: { ...importEnvelope, sourceLabel: 'Synthetic restored shared decision ' + index } })), 201, 'Distinct source staged for shared decision-ID race'));
  const sharedDecision = { ...decisionInput, clientDecisionId: crypto.randomUUID() };
  const uuidChecksBefore = count(restored, 'reading_checks'), uuidReceiptsBefore = count(restored, 'reading_import_receipts');
  const decisionRace = await Promise.all(sharedDecisionDrafts.map(draft => routes.importDecision.POST(request('teacher-a', 'POST', sharedDecision), params(draft.draft.id))));
  check(decisionRace.map(response => response.status).sort(), [200, 409], 'One decision UUID cannot review two distinct restored drafts concurrently');
  check(count(restored, 'reading_checks'), uuidChecksBefore + 2, 'Shared decision-ID race creates one complete observation batch');
  check(count(restored, 'reading_import_receipts'), uuidReceiptsBefore + 2, 'Shared decision-ID race creates one complete receipt batch');
  check(restored.prepare('SELECT count(*) n FROM reading_import_drafts WHERE decision_id=?').get(sharedDecision.clientDecisionId).n, 1, 'Unique restored decision identity has exactly one established review');
  check(sharedDecisionDrafts.map(draft => restored.prepare('SELECT status FROM reading_import_drafts WHERE id=?').get(draft.draft.id).status).sort(), ['confirmed', 'staged'], 'Shared decision-ID loser retains untouched staged evidence');
  check(restored.prepare('PRAGMA foreign_key_check').all(), [], 'Restored continued work retains foreign-key integrity');
  check(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok', 'Restored continued work retains database integrity');
  check(sqlite.prepare('SELECT status FROM reading_import_drafts WHERE id=?').get(pending.draft.id).status, 'staged', 'Second restored database mutations never alter source database');
  check(databaseSnapshot(sqlite), before, 'All original confirmed source records remain intact after independent restored work');
  check(networkCalls, 0, 'Recovery review/retries stay local without providers or real recipients');
  console.log(`Development recovery contract: ${checks} checks passed (populated synthetic local encrypted snapshot/restore; exact evidence, constraints and actual session-backed retries; no deployed recovery claim).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, scope: 'disposable-local-encrypted-roundtrip',
    tables: Object.keys(before.tables).length, indexes: before.objects.filter(object => object.type === 'index').length,
    triggers: before.objects.filter(object => object.type === 'trigger').length, externalRequests: networkCalls }));
} finally { globalThis.__sahaTestDb = sourceDb; globalThis.fetch = originalFetch; restored?.close(); sqlite.close(); rmSync(directory, { recursive: true, force: true }); }
