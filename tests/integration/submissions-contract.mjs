import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const resources = await load('lib/education/resources.ts');
const submissions = await load('app/api/assignments/[id]/submissions/route.ts');
const feedback = await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts');
const { submissionAttempts, submissionFeedback } = await load('db/submission-schema.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'student-user-a', 'student-user-other', 'student-user-b']) {
  sessions[id] = (await createSession(id)).split(';')[0];
}
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
const content = { title: 'Synthetic reasoning task', type: 'worksheet', curriculum: 'Synthetic curriculum', gradeLevel: '8',
  subject: 'Mathematics', language: 'en-IN', objectives: 'Explain a comparison.', body: 'Explain why one half is greater than one quarter.',
  teacherNotes: 'Private staff observation.', answerKey: 'Private exact answer key.' };
const resource = await resources.createResource(teacher, { content });
await resources.approveResource(teacher, resource.id, resource.latest.id);
// A past due date is informational while no late policy has been approved.
const assignment = await resources.assignResource(teacher, resource.id, { versionId: resource.latest.id, classId: 'class-a', dueDate: '2020-01-01' });
const revision = await resources.reviseResource(teacher, resource.id, { expectedVersion: 1, content: { ...content, body: 'A later unapproved draft.' } });
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function request(user, method = 'GET', payload, suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin };
  if (user) headers.cookie = sessions[user];
  const init = { method, headers };
  if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(payload); }
  return new Request(origin + '/api/assignments/' + assignment.id + '/submissions', init);
}
function call(route, method, user, payload, submissionId = 'missing', assignmentId = assignment.id, suppliedOrigin = origin) {
  return route[method](request(user, method, payload, suppliedOrigin), { params: Promise.resolve({ id: assignmentId, submissionId }) });
}
async function read(route, user, submissionId, assignmentId) {
  const response = await call(route, 'GET', user, undefined, submissionId, assignmentId);
  check(response.status, 200, 'Authorized submission/feedback read');
  check(response.headers.get('cache-control'), 'no-store', 'Submission evidence stays uncached');
  return response.json();
}
function attempt(expectedAttempt = 0, response = 'Synthetic learner explanation.', clientSubmissionId = crypto.randomUUID()) {
  return { response, expectedAttempt, clientSubmissionId };
}
function review(expectedRevision = 0, value = 'Reviewed formative guidance.', clientFeedbackId = crypto.randomUUID()) {
  return { feedback: value, reviewed: true, expectedRevision, clientFeedbackId };
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Submission contract must stay local and synthetic'); };
try {
  for (const route of [submissions, feedback]) {
    for (const method of ['GET', 'POST']) {
      check((await call(route, method, null, method === 'POST' ? {} : undefined)).status, 401, 'Anonymous endpoint denied');
      if (method === 'POST') check((await call(route, method, 'student-user-a', {}, 'missing', assignment.id, 'https://attacker.example.invalid')).status, 403, 'Mutation requires same origin');
    }
  }
  const forged = new Request(origin + '/api/assignments', { headers: { cookie: 'saha_demo_role=admin', 'x-user-id': 'student-user-a', 'x-school-id': 'a' } });
  check((await submissions.GET(forged, { params: Promise.resolve({ id: assignment.id }) })).status, 401, 'Public authority headers and role cookies cannot authorize');
  check((await read(submissions, 'student-user-a')).length, 0, 'Active learner starts with no attempts');
  check((await read(submissions, 'teacher-a')).length, 0, 'Assigned teacher starts with no attempts');
  for (const user of ['student-user-other', 'student-user-b', 'teacher-other', 'teacher-b', 'admin-b']) {
    check((await call(submissions, 'GET', user)).status, 404, 'Other student/class/school cannot inspect assignment submissions');
  }
  check((await call(submissions, 'GET', 'guardian-a')).status, 403, 'Guardian cannot inspect raw learner submissions');
  for (const user of ['teacher-a', 'admin-a', 'guardian-a']) {
    check((await call(submissions, 'POST', user, attempt())).status, 403, 'Only learners submit their own work');
    const invalid = new Request(request(user, 'POST'), { body: '{invalid' });
    check((await submissions.POST(invalid, { params: Promise.resolve({ id: assignment.id }) })).status, 403, 'Wrong role denied before submission JSON parsing');
    check((await call(submissions, 'POST', user, { studentId: 'student-a', submittedBy: 'student-user-a' })).status, 403, 'Spoofed authority fields cannot change denied role');
  }
  for (const payload of [
    { ...attempt(), studentId: 'student-other' }, { ...attempt(), submittedBy: 'teacher-a' }, { ...attempt(), versionId: revision.latest.id },
    { ...attempt(), response: '' }, { ...attempt(), response: 'x'.repeat(20001) }, { ...attempt(), response: 'bad\u0000text' },
    { ...attempt(), expectedAttempt: -1 }, { ...attempt(), expectedAttempt: 1.5 }, { ...attempt(), clientSubmissionId: 'invalid' },
    { ...attempt(), attachmentUrl: 'https://example.invalid/private.pdf' },
  ]) check((await call(submissions, 'POST', 'student-user-a', payload)).status, 400, 'Strict bounded plain-text submission payload');
  const malformed = new Request(request('student-user-a', 'POST'), { body: '{invalid' });
  check((await submissions.POST(malformed, { params: Promise.resolve({ id: assignment.id }) })).status, 400, 'Malformed JSON fails safely');
  check((await call(submissions, 'POST', 'student-user-a', attempt(1))).status, 409, 'No missing first attempt can be bypassed');
  const firstInput = attempt();
  let response = await call(submissions, 'POST', 'student-user-a', firstInput);
  check(response.status, 201, 'Active student submits despite informational past due date');
  const first = await response.json();
  check(first.id, firstInput.clientSubmissionId, 'Client UUID preserves retry identity');
  check(first.studentId, 'student-a', 'Explicit server-linked student profile persisted');
  check(first.submittedBy, 'student-user-a', 'Authenticated learner attribution persisted');
  check(first.versionId, resource.latest.id, 'Attempt pins approved assigned version');
  check(first.versionId === revision.latest.id, false, 'Later draft is not the submitted version');
  check(first.attempt, 1, 'First attempt sequence');
  check(first.feedback, [], 'No automatic feedback or grading');
  check(JSON.stringify(first).includes(content.answerKey), false, 'Submission API never includes resource answer key');
  check(JSON.stringify(first).includes(content.teacherNotes), false, 'Submission API never includes private teacher notes');
  response = await call(submissions, 'POST', 'student-user-a', firstInput);
  check(response.status, 201, 'Exact retry succeeds');
  check(await response.json(), first, 'Retry preserves immutable original attempt evidence');
  check((await call(submissions, 'POST', 'student-user-a', { ...firstInput, response: 'Changed retry' })).status, 409, 'Changed retry cannot overwrite original work');
  check((await call(submissions, 'POST', 'student-user-a', { ...firstInput, expectedAttempt: 1 })).status, 409, 'Retry UUID cannot move to another attempt');
  check((await call(submissions, 'POST', 'student-user-a', attempt())).status, 409, 'Stale expected attempt conflicts');
  check((await read(submissions, 'student-user-a')).length, 1, 'Stale/changed requests append no record');
  check((await read(submissions, 'admin-a')).length, 1, 'Own-school administrator reads submitted evidence');

  // A second active learner may see the same task but not another student's work.
  sqlite.prepare("INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('extra-enrolment','student-other','class-a','active','2026-10-05','2026-10-05','2026-10-05')").run();
  check((await read(submissions, 'student-user-other')).length, 0, 'Same-class learner cannot list another learner attempt');
  check((await call(feedback, 'GET', 'student-user-other', undefined, first.id)).status, 404, 'Same-class learner cannot fetch another learner feedback');
  check((await call(submissions, 'POST', 'student-user-other', firstInput)).status, 409, 'Retry UUID cannot be claimed by another learner');
  for (const user of ['student-user-a', 'student-user-other', 'guardian-a']) {
    check((await call(feedback, 'POST', user, review(), first.id)).status, 403, 'Learners and guardians cannot supply staff feedback');
    const invalid = new Request(request(user, 'POST'), { body: '{invalid' });
    check((await feedback.POST(invalid, { params: Promise.resolve({ id: assignment.id, submissionId: first.id }) })).status, 403, 'Wrong role denied before feedback JSON parsing');
    check((await call(feedback, 'POST', user, { reviewedBy: 'teacher-a', feedback: 'Spoofed reviewer' }, first.id)).status, 403, 'Spoofed authority fields cannot grant review role');
  }
  for (const user of ['teacher-other', 'admin-b']) {
    check((await call(feedback, 'POST', user, review(), first.id)).status, 404, 'Nonassigned teacher and foreign administrator cannot review');
  }
  for (const payload of [
    { ...review(), reviewed: false }, { ...review(), reviewed: undefined }, { ...review(), reviewedBy: 'admin-a' },
    { ...review(), feedback: '' }, { ...review(), feedback: 'x'.repeat(8001) }, { ...review(), expectedRevision: -1 },
    { ...review(), grade: 'A' },
  ]) check((await call(feedback, 'POST', 'teacher-a', payload, first.id)).status, 400, 'Explicit review and bounded formative feedback required');
  const firstFeedbackInput = review();
  response = await call(feedback, 'POST', 'teacher-a', firstFeedbackInput, first.id);
  check(response.status, 201, 'Assigned teacher records explicitly reviewed guidance');
  const firstFeedback = await response.json();
  check(firstFeedback.submissionId, first.id, 'Feedback references exact attempt');
  check(firstFeedback.reviewedBy, 'teacher-a', 'Reviewer is authenticated staff');
  check(firstFeedback.revision, 1, 'Feedback begins its immutable revision sequence');
  check(typeof firstFeedback.reviewedAt, 'string', 'Review timestamp recorded');
  response = await call(feedback, 'POST', 'teacher-a', firstFeedbackInput, first.id);
  check(response.status, 201, 'Exact feedback retry succeeds');
  check(await response.json(), firstFeedback, 'Feedback retry preserves reviewer/timestamp');
  check((await call(feedback, 'POST', 'teacher-a', { ...firstFeedbackInput, feedback: 'Changed retry' }, first.id)).status, 409, 'Changed feedback retry conflicts');
  check((await call(feedback, 'POST', 'admin-a', firstFeedbackInput, first.id)).status, 409, 'Other reviewer cannot claim an existing retry UUID');
  check((await read(feedback, 'student-user-a', first.id))[0], firstFeedback, 'Student sees only reviewed feedback for own attempt');
  const feedback2 = await call(feedback, 'POST', 'admin-a', review(1, 'Correction to reviewed guidance.'), first.id);
  check(feedback2.status, 201, 'Administrator appends feedback correction');
  const feedbackHistory = await read(feedback, 'student-user-a', first.id);
  check(feedbackHistory.length, 2, 'Feedback correction preserves earlier review');
  check(feedbackHistory[1], firstFeedback, 'Earlier reviewed evidence remains immutable');
  check((await call(feedback, 'POST', 'teacher-a', review(1), first.id)).status, 409, 'Stale feedback revision conflicts');

  const secondInput = attempt(1, 'Revised learner explanation.');
  response = await call(submissions, 'POST', 'student-user-a', secondInput);
  check(response.status, 201, 'Learner appends a revised attempt');
  const second = await response.json();
  check(second.attempt, 2, 'New attempt increments its sequence');
  check(second.feedback.length, 0, 'Feedback on first attempt does not silently transfer');
  let history = await read(submissions, 'student-user-a');
  check(history.length, 2, 'Past learner response preserved');
  check(history.find(row => row.id === first.id).response, first.response, 'First attempt content unchanged');
  check(history.find(row => row.id === first.id).feedback.length, 2, 'First attempt keeps its reviewed guidance history');
  check((await call(feedback, 'GET', 'teacher-a', undefined, first.id, 'missing-assignment')).status, 404, 'Exact submission must belong to addressed assignment');

  const revisionRace = await Promise.all([
    call(submissions, 'POST', 'student-user-a', attempt(2, 'Concurrent explanation A.')),
    call(submissions, 'POST', 'student-user-a', attempt(2, 'Concurrent explanation B.')),
  ]);
  check(revisionRace.map(row => row.status).sort(), [201, 409], 'Concurrent attempts produce one winner');
  history = await read(submissions, 'student-user-a');
  check(history.length, 3, 'Attempt race appends exactly one record');
  const retryRaceInput = attempt(3, 'Concurrent identical retry.');
  const retryRace = await Promise.all([
    call(submissions, 'POST', 'student-user-a', retryRaceInput), call(submissions, 'POST', 'student-user-a', retryRaceInput),
  ]);
  check(retryRace.map(row => row.status), [201, 201], 'Concurrent identical retries succeed');
  const retryBodies = await Promise.all(retryRace.map(row => row.json()));
  check(retryBodies[0], retryBodies[1], 'Concurrent retry returns one immutable attempt');
  const reviewRace = await Promise.all([
    call(feedback, 'POST', 'teacher-a', review(0, 'Reviewer A.'), second.id),
    call(feedback, 'POST', 'admin-a', review(0, 'Reviewer B.'), second.id),
  ]);
  check(reviewRace.map(row => row.status).sort(), [201, 409], 'Concurrent feedback preserves one first revision');
  const reviewRetryInput = review(1, 'Concurrent same reviewer retry.');
  const reviewRetryRace = await Promise.all([
    call(feedback, 'POST', 'teacher-a', reviewRetryInput, second.id), call(feedback, 'POST', 'teacher-a', reviewRetryInput, second.id),
  ]);
  check(reviewRetryRace.map(row => row.status), [201, 201], 'Concurrent identical review retries succeed');
  check(...(await Promise.all(reviewRetryRace.map(row => row.json()))), 'One immutable review correction returned');

  // Simulate authority changes after validation but before the actual INSERT.
  const originalDb = globalThis.__sahaTestDb;
  function beforeInsert(table, mutate) {
    globalThis.__sahaTestDb = new Proxy(originalDb, { get(target, property) {
      if (property === 'insert') return insertedTable => {
        if (insertedTable === table) { globalThis.__sahaTestDb = originalDb; mutate(); }
        return target.insert(insertedTable);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  beforeInsert(submissionAttempts, () => sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a' AND class_id='class-a'").run());
  check((await call(submissions, 'POST', 'student-user-a', attempt(4))).status, 404, 'Withdrawal between validation and INSERT prevents learner write');
  check(sqlite.prepare("SELECT count(*) n FROM submission_attempts WHERE student_id='student-a'").get().n, 4, 'Withdrawn race inserts no attempt');
  check((await call(submissions, 'GET', 'student-user-a')).status, 404, 'Withdrawn learner no longer reads assignment evidence');
  check((await read(submissions, 'teacher-a')).length, 4, 'Staff can retain historical submitted evidence after withdrawal');
  sqlite.prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a' AND class_id='class-a'").run();
  beforeInsert(submissionFeedback, () => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run());
  check((await call(feedback, 'POST', 'teacher-a', review(2), second.id)).status, 404, 'Class reassignment between validation and INSERT prevents old teacher review');
  check(sqlite.prepare('SELECT count(*) n FROM submission_feedback WHERE submission_id=?').get(second.id).n, 2, 'Class race inserts no review');
  check((await call(submissions, 'GET', 'teacher-a')).status, 404, 'Former class teacher no longer reads attempts');
  check((await read(submissions, 'teacher-other')).length, 4, 'New assigned teacher gains scoped historical read');
  sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  beforeInsert(submissionAttempts, () => sqlite.prepare("UPDATE users SET disabled_at='2026-10-05' WHERE id='student-user-a'").run());
  check((await call(submissions, 'POST', 'student-user-a', attempt(4))).status, 404, 'Account revocation between validation and INSERT prevents attempt');
  check((await call(submissions, 'GET', 'student-user-a')).status, 401, 'Disabled account session denied on subsequent request');
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='student-user-a'").run();
  beforeInsert(submissionFeedback, () => sqlite.prepare("UPDATE users SET role='guardian' WHERE id='teacher-a'").run());
  check((await call(feedback, 'POST', 'teacher-a', review(2), second.id)).status, 404, 'Role change before INSERT prevents staff review');
  check(sqlite.prepare('SELECT count(*) n FROM submission_feedback WHERE submission_id=?').get(second.id).n, 2, 'Role race inserts no review');
  sqlite.prepare("UPDATE users SET role='teacher' WHERE id='teacher-a'").run();
  globalThis.__sahaTestDb = originalDb;
  check(networkCalls, 0, 'No AI provider, external messages or automatic grading');
  console.log(`Learner submissions contract: ${checks} checks passed (actual authenticated routes and SQLite; immutable attempts/reviewed feedback; synthetic only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
