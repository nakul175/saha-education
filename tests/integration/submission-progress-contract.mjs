// FR-24 progress views: learner status, staff class tallies and the per-assignment roster. Read-only views over
// saved attempts, reviewed feedback and window state. Real route handlers over SQLite; synthetic only, no network.
import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const resources = await load('lib/education/resources.ts');
const routes = {
  summary: await load('app/api/assignment-progress/route.ts'),
  roster: await load('app/api/assignments/[id]/progress/route.ts'),
  attempts: await load('app/api/assignments/[id]/submissions/route.ts'),
  feedback: await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts'),
  window: await load('app/api/assignments/[id]/submission-window/route.ts'),
};
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'student-user-a', 'student-user-other']) sessions[id] = (await createSession(id)).split(';')[0];
// Two more learners in class-a: one stays active without submitting, one submits and then withdraws.
await db.insert(schema.students).values([['student-c', 'Chandra', 'Synthetic-Nair'], ['student-d', 'Dev', 'Synthetic-Rao']].map(([id, firstName, lastName]) => ({ id, schoolId: 'a', firstName, lastName,
  dateOfBirth: '2012-01-01', admissionNumber: 'PROG-' + id, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
await db.insert(schema.users).values(['c', 'd'].map(letter => ({ id: 'student-user-' + letter, role: 'student', schoolId: 'a', name: 'Synthetic learner ' + letter, email: letter + '@example.invalid',
  identityIssuer: 'https://identity.example.invalid', identitySubject: 'sub-student-user-' + letter, createdAt: stamp, updatedAt: stamp })));
sqlite.exec("UPDATE students SET user_id = 'student-user-c' WHERE id = 'student-c'; UPDATE students SET user_id = 'student-user-d' WHERE id = 'student-d'");
await db.insert(schema.enrolments).values(['student-c', 'student-d'].map(studentId => ({ id: studentId + '-enrolment', studentId, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
for (const id of ['student-user-c', 'student-user-d']) sessions[id] = (await createSession(id)).split(';')[0];

const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' }, otherTeacher = { id: 'teacher-other', role: 'teacher', schoolId: 'a' };
const content = { title: 'Synthetic progress task', type: 'worksheet', curriculum: 'Synthetic curriculum', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN',
  objectives: 'Explain a comparison.', body: 'Explain why one half is greater than one quarter.', teacherNotes: 'Private staff observation.', answerKey: 'Private exact answer key.' };
const resource = await resources.createResource(teacher, { content });
await resources.approveResource(teacher, resource.id, resource.latest.id);
const assignment = await resources.assignResource(teacher, resource.id, { versionId: resource.latest.id, classId: 'class-a', dueDate: '2020-01-01' });
const otherResource = await resources.createResource(otherTeacher, { content: { ...content, title: 'Synthetic other class task' } });
await resources.approveResource(otherTeacher, otherResource.id, otherResource.latest.id);
const otherAssignment = await resources.assignResource(otherTeacher, otherResource.id, { versionId: otherResource.latest.id, classId: 'class-other' });
const futureResource = await resources.createResource(teacher, { content: { ...content, title: 'Synthetic future task' } });
await resources.approveResource(teacher, futureResource.id, futureResource.latest.id);
const futureAssignment = await resources.assignResource(teacher, futureResource.id, { versionId: futureResource.latest.id, classId: 'class-a', dueDate: '2999-01-01' });

let checks = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
function request(user, method, path, payload, suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin };
  if (user) headers.cookie = sessions[user];
  const init = { method, headers };
  if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(payload); }
  return new Request(origin + path, init);
}
const ctx = (id, submissionId = 'x') => ({ params: Promise.resolve({ id, submissionId }) });
const summary = async user => { const response = await routes.summary.GET(request(user, 'GET', '/api/assignment-progress')); return { status: response.status, cache: response.headers.get('cache-control'), body: response.status === 200 ? await response.json() : null }; };
const roster = async (user, id = assignment.id) => { const response = await routes.roster.GET(request(user, 'GET', '/x'), ctx(id)); return { status: response.status, cache: response.headers.get('cache-control'), body: response.status === 200 ? await response.json() : null }; };
const submit = async (user, text, expectedAttempt) => routes.attempts.POST(request(user, 'POST', '/x', { response: text, expectedAttempt, clientSubmissionId: crypto.randomUUID() }), ctx(assignment.id));
const review = async (user, submissionId, text, expectedRevision) => routes.feedback.POST(request(user, 'POST', '/x', { feedback: text, reviewed: true, expectedRevision, clientFeedbackId: crypto.randomUUID() }), ctx(assignment.id, submissionId));
const item = (result, id = assignment.id) => result.body.items.find(entry => entry.assignmentId === id);
const rowOf = (result, studentId) => result.body.rows.find(row => row.studentId === studentId);
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Progress views must stay local and synthetic'); };
try {
  // ---- access boundaries ---------------------------------------------------
  check((await summary(null)).status, 401, 'Anonymous summary denied');
  check((await roster(null)).status, 401, 'Anonymous roster denied');
  check((await summary('guardian-a')).status, 403, 'Guardian has no submission progress');
  for (const user of ['guardian-a', 'student-user-a', 'student-user-other']) check((await roster(user)).status, 403, 'Only staff read a class roster');
  for (const user of ['teacher-other', 'teacher-b', 'admin-b']) check((await roster(user)).status, 404, 'Staff outside the class cannot read its roster');
  check((await roster('teacher-a', 'missing-assignment')).status, 404, 'Unknown assignment hides existence');
  const forged = await routes.summary.GET(new Request(origin + '/api/assignment-progress', { headers: { cookie: 'saha_demo_role=admin', 'x-user-id': 'student-user-a', 'x-school-id': 'a' } }));
  check(forged.status, 401, 'Public authority headers and role cookies cannot authorize');

  // ---- before anyone submits -------------------------------------------------
  let learner = await summary('student-user-a');
  check([learner.status, learner.cache, learner.body.role], [200, 'no-store', 'student'], 'Learner summary is private and uncached');
  check(learner.body.items.map(entry => entry.assignmentId).sort(), [assignment.id, futureAssignment.id].sort(), 'Learner sees only the assignments of their own class');
  check(item(learner).mine, { attempts: 0, latestAttemptAt: null, latestAfterDueDate: false, status: 'not-submitted' }, 'No attempts reads as not submitted');
  check([item(learner).dueDatePassed, item(learner, futureAssignment.id).dueDatePassed], [true, false], 'Due date passage is reported without blocking anything');
  check(item(learner).window, { state: 'open', closesAt: null, configured: false, acceptingSubmissions: true }, 'No recorded window means open and unconfigured');
  check('classProgress' in item(learner), false, 'A learner summary carries no class tallies');
  check(JSON.stringify(learner.body).includes('Private'), false, 'Teacher notes and answer key never appear');
  const otherLearner = await summary('student-user-other');
  check(otherLearner.body.items.map(entry => entry.assignmentId), [otherAssignment.id], 'Another class sees only its own assignment');

  // ---- submit, review, resubmit -------------------------------------------
  let response = await submit('student-user-a', 'Half is greater because the pieces are larger.', 0);
  check(response.status, 201, 'Learner saves attempt one');
  const attemptOne = await response.json();
  learner = await summary('student-user-a');
  check([item(learner).mine.attempts, item(learner).mine.status, item(learner).mine.latestAfterDueDate], [1, 'awaiting-feedback', true], 'Saved attempt awaits feedback and is after the informational due date');
  check(item(learner, futureAssignment.id).mine.status, 'not-submitted', 'Other assignments stay independent');
  check((await summary('student-user-c')).body.items.find(entry => entry.assignmentId === assignment.id).mine.status, 'not-submitted', 'Another learner is unaffected by this learner attempt');
  response = await review('teacher-a', attemptOne.id, 'Good start. Say how you compared the pieces.', 0);
  check(response.status, 201, 'Teacher gives reviewed feedback');
  learner = await summary('student-user-a');
  check(item(learner).mine.status, 'feedback-given', 'Reviewed feedback is reflected for the learner');
  response = await submit('student-user-a', 'Half is greater: two quarters make one half.', 1);
  check(response.status, 201, 'Learner resubmits');
  learner = await summary('student-user-a');
  check([item(learner).mine.attempts, item(learner).mine.status], [2, 'awaiting-feedback'], 'A newer attempt awaits its own feedback');

  // ---- staff view -----------------------------------------------------------
  const staff = await summary('teacher-a');
  check(staff.body.role, 'staff', 'Staff receive class tallies');
  check(item(staff).classProgress, { enrolled: 3, submitted: 1, awaitingFeedback: 1, feedbackGiven: 0 }, 'Tally counts enrolled, submitted and awaiting learners');
  check('mine' in item(staff), false, 'A staff summary carries no personal learner status');
  check(staff.body.items.map(entry => entry.assignmentId).sort(), [assignment.id, futureAssignment.id].sort(), 'A teacher sees only their own classes');
  check((await summary('teacher-other')).body.items.map(entry => entry.assignmentId), [otherAssignment.id], 'Another teacher sees only their class');
  check((await summary('admin-a')).body.items.length, 3, 'Administrator sees every assignment in the school');
  check((await summary('admin-b')).body.items, [], 'Another school sees nothing');

  response = await submit('student-user-d', 'Dev thinks a half is bigger.', 0);
  check(response.status, 201, 'Second learner submits');
  const devAttempt = await response.json();
  response = await review('teacher-a', devAttempt.id, 'Clear answer. Add a picture next time.', 0);
  check(response.status, 201, 'Feedback for the second learner');
  const full = await roster('teacher-a');
  check([full.status, full.cache], [200, 'no-store'], 'Roster is private and uncached');
  check(full.body.totals, { enrolled: 3, submitted: 2, notSubmitted: 1, awaitingFeedback: 1, feedbackGiven: 1 }, 'Roster totals');
  check(full.body.rows.map(row => [row.name, row.status, row.attempts, row.enrolled]).sort(), [['Chandra Synthetic-Nair', 'not-submitted', 0, true], ['Dev Synthetic-Rao', 'feedback-given', 1, true], ['student-a Synthetic', 'awaiting-feedback', 2, true]].sort(), 'Each learner is listed by name with status and attempts');
  check(rowOf(full, 'student-a').latestAttemptNumber, 2, 'Roster reports the latest attempt number');
  check(rowOf(full, 'student-c').latestAttemptAt, null, 'A learner who never submitted has no attempt time');
  check(rowOf(full, 'student-a').latestAfterDueDate, true, 'Roster flags the latest attempt as after the informational due date');
  check(rowOf(full, 'student-d').feedbackRevision, 1, 'Roster reports the reviewed feedback revision');
  check(JSON.stringify(full.body).includes('student-user-'), false, 'Roster does not expose account identifiers');
  check(JSON.stringify(full.body).includes('Half is greater'), false, 'Roster does not repeat learner response text');
  check(JSON.stringify(full.body).includes('Good start'), false, 'Roster does not repeat feedback text');
  check((await roster('admin-a')).body.totals.enrolled, 3, 'Administrator reads the same roster');
  const future = await roster('teacher-a', futureAssignment.id);
  check([future.body.dueDatePassed, future.body.totals.submitted], [false, 0], 'An assignment nobody submitted shows nothing submitted');

  // ---- window state --------------------------------------------------------
  response = await routes.window.POST(request('teacher-a', 'POST', '/x', { clientPolicyId: crypto.randomUUID(), expectedRevision: 0, state: 'closed', closesAt: null, reviewConfirmed: true, reason: 'Closing for synthetic review.' }), ctx(assignment.id));
  check(response.status, 201, 'Teacher closes the window');
  learner = await summary('student-user-a');
  check(item(learner).window, { state: 'closed', closesAt: null, configured: true, acceptingSubmissions: false }, 'Closed window is visible to the learner');
  check(item(learner).mine.status, 'awaiting-feedback', 'Closing keeps saved attempts and their status');
  check(item(await summary('teacher-a')).window.acceptingSubmissions, false, 'Staff see the closed window');
  const closesLater = new Date(Date.now() + 3600000).toISOString();
  response = await routes.window.POST(request('teacher-a', 'POST', '/x', { clientPolicyId: crypto.randomUUID(), expectedRevision: 1, state: 'open', closesAt: closesLater, reviewConfirmed: true, reason: 'Reopening until later today.' }), ctx(assignment.id));
  check(response.status, 201, 'Teacher reopens with a closing time');
  check(item(await summary('student-user-a')).window, { state: 'open', closesAt: closesLater, configured: true, acceptingSubmissions: true }, 'Timed window reports its closing time');
  const closesEarlier = new Date(Date.now() - 3600000).toISOString();
  sqlite.exec('DROP TRIGGER assignment_submission_windows_no_update');
  sqlite.prepare('UPDATE assignment_submission_windows SET closes_at = ? WHERE revision = 2').run(closesEarlier);
  check(item(await summary('student-user-a')).window.acceptingSubmissions, false, 'An elapsed closing time reads as not accepting');

  // ---- withdrawal ----------------------------------------------------------
  sqlite.prepare("UPDATE enrolments SET status = 'withdrawn' WHERE student_id = 'student-d'").run();
  const afterWithdrawal = await roster('teacher-a');
  check(afterWithdrawal.body.totals, { enrolled: 2, submitted: 1, notSubmitted: 1, awaitingFeedback: 1, feedbackGiven: 0 }, 'A withdrawn learner leaves the current tallies');
  check(rowOf(afterWithdrawal, 'student-d').enrolled, false, 'Staff keep the withdrawn learner saved history flagged as not enrolled');
  check(item(await summary('teacher-a')).classProgress, { enrolled: 2, submitted: 1, awaitingFeedback: 1, feedbackGiven: 0 }, 'Class summary matches the roster');
  check((await summary('student-user-d')).body.items.map(entry => entry.assignmentId), [], 'A withdrawn learner sees no class assignments');
  // A disabled teacher loses access immediately.
  sqlite.prepare("UPDATE users SET disabled_at = ? WHERE id = 'teacher-a'").run(stamp);
  const disabled = [(await roster('teacher-a')).status, (await summary('teacher-a')).status];
  check(disabled.every(code => code === 401 || code === 403), true, 'A disabled teacher receives neither roster nor summary: ' + disabled.join(','));
  check(networkCalls, 0, 'No network call was made');
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
console.log(`Submission progress contract: ${checks} checks passed (actual authenticated routes and SQLite; learner status, class tallies and roster; synthetic only).`);
console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
