// Manual served checks against a built Worker and isolated synthetic local D1.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const origin = process.env.SAHA_WORKER_TEST_URL;
const fixture = process.env.SAHA_WORKER_SESSION_FIXTURE;
if (!origin || !fixture) throw new Error('Supply the isolated local Worker origin and synthetic session fixture.');
const base = new URL(origin);
if (!['localhost', '127.0.0.1'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/') throw new Error('Synthetic fixture checks require a localhost origin.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8'));
for (const user of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) if (typeof sessions[user] !== 'string') throw new Error('Missing required synthetic session: ' + user);
let passed = 0;
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); passed++; console.log('ok - ' + name); };
async function request(path, user, method = 'GET', body, suppliedOrigin = base.origin) {
  const response = await fetch(new URL(path, base), {
    method, redirect: 'manual', signal: AbortSignal.timeout(10000), headers: {
      ...(user ? { Cookie: sessions[user] } : {}), ...(method === 'GET' ? {} : { Origin: suppliedOrigin, 'Content-Type': 'application/json' }),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Consume every body, including denied/redirect responses, to release fetch
  // connections. Return a buffered response so JSON assertions still work.
  return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers: response.headers });
}
async function json(path, user, method = 'GET', body, expected = 200) {
  const response = await request(path, user, method, body);
  check(response.status, expected, method + ' ' + path + ' expected status');
  check(response.headers.get('cache-control'), 'no-store', 'Sensitive response stays uncached');
  return response.json();
}
const suffix = crypto.randomUUID().slice(0, 8);
let withdrew = false;
try {
  const protectedApis = ['/api/admin/users', '/api/admin/users/events', '/api/curriculum', '/api/curriculum/missing', '/api/curriculum/missing/versions', '/api/curriculum/missing/snapshot?versionId=missing', '/api/assignments/missing/submissions', '/api/assignments/missing/submissions/missing/feedback', '/api/reading-review', '/api/reading-checks/missing/corrections'];
  for (const path of protectedApis) check((await request(path)).status, 401, 'Anonymous API denied: ' + path);
  for (const path of ['/admin/users', '/curriculum', '/curriculum/missing', '/assignments/missing', '/reading-review']) {
    const response = await request(path);
    check(response.status, 307, 'Protected page redirects: ' + path);
    check(new URL(response.headers.get('location'), base).pathname, '/login', 'Redirect goes to sign-in');
  }
  check((await request('/api/auth/login', undefined, 'POST', {})).status, 503, 'Unconfigured provider fails closed');
  check((await request('/api/admin/users', 'teacher-a')).status, 403, 'Teacher cannot administer accounts');
  for (const path of ['/api/curriculum', '/api/reading-review']) check((await request(path, 'student-user-a')).status, 403, 'Learner cannot read staff-only workspace');
  for (const [path, method] of [['/api/admin/users', 'POST'], ['/api/curriculum', 'POST'], ['/api/assignments/missing/submissions', 'POST'], ['/api/reading-checks/missing/corrections', 'POST']]) check((await request(path, 'admin-a', method, {}, 'https://attacker.example.invalid')).status, 403, 'Foreign origin rejected: ' + path);

  const provision = { name: 'Synthetic served educator ' + suffix, email: 'served-' + suffix + '@example.invalid', role: 'teacher',
    identityIssuer: 'https://identity.example.invalid', identitySubject: 'served-subject-' + suffix,
    reason: 'Synthetic local account mapping review.', reviewConfirmed: true, clientRequestId: crypto.randomUUID() };
  const account = await json('/api/admin/users', 'admin-a', 'POST', provision, 201);
  check(account.user.schoolId, 'a', 'Provisioned school comes from administrator');
  check(account.user.role, 'teacher', 'Provisioned role matches reviewed request');
  check(account.event.actorId, 'admin-a', 'Review attributes administrator');
  check(await json('/api/admin/users', 'admin-a', 'POST', provision, 201), account, 'Exact provision retry preserves account/review');
  check((await request('/api/admin/users/' + account.user.id, 'admin-b', 'PATCH', { enabled: false, expectedVersion: 1, reason: 'Synthetic invalid other school access.', reviewConfirmed: true, clientRequestId: crypto.randomUUID() })).status, 404, 'Cross-school status mutation denied');
  const disable = { enabled: false, expectedVersion: account.user.version, reason: 'Synthetic local reviewed disablement.', reviewConfirmed: true, clientRequestId: crypto.randomUUID() };
  const disabled = await json('/api/admin/users/' + account.user.id, 'admin-a', 'PATCH', disable);
  check(typeof disabled.user.disabledAt, 'string', 'Disablement persists status');
  check(disabled.event.previousEnabled, true, 'Disable review retains prior status');
  check(disabled.event.nextEnabled, false, 'Disable review retains new status');
  check(await json('/api/admin/users/' + account.user.id, 'admin-a', 'PATCH', disable), disabled, 'Status retry retains review');
  const enabled = await json('/api/admin/users/' + account.user.id, 'admin-a', 'PATCH', { enabled: true, expectedVersion: disabled.user.version, reason: 'Synthetic reviewed return of access.', reviewConfirmed: true, clientRequestId: crypto.randomUUID() });
  check(enabled.user.disabledAt, null, 'Reviewed enablement restores account state');
  const events = await json('/api/admin/users/events', 'admin-a');
  check(events.filter(event => event.userId === account.user.id).length, 3, 'Append-only provision/disable/enable reviews retained');
  check(JSON.stringify(events).includes('requestHash'), false, 'Private retry digests omitted from reviews');

  const content = { title: 'Synthetic served fractions ' + suffix, curriculum: 'Synthetic pilot', gradeLevel: '8', subject: 'Mathematics', language: 'en-IN',
    objectives: 'Explain a fraction comparison.', body: 'Compare 1/2 and 1/4. <script>window.SAHA_INJECTED=true</script>',
    rightsStatement: 'Original synthetic test material; school copying permitted.', sourceReference: 'SYNTHETIC-' + suffix, sourceUrl: 'https://sources.example.invalid/' + suffix };
  const created = await json('/api/curriculum', 'teacher-a', 'POST', { content, clientReferenceId: crypto.randomUUID() }, 201);
  const curriculumPath = '/api/curriculum/' + created.id;
  check(created.latest.approvedAt, null, 'Curriculum begins unreviewed');
  check((await request(curriculumPath, 'teacher-other')).status, 404, 'Peer cannot inspect private reference');
  check((await request(curriculumPath, 'admin-b')).status, 404, 'Foreign school cannot inspect reference');
  check((await request(curriculumPath + '/draft', 'teacher-a', 'POST', { versionId: created.latest.id, type: 'worksheet' })).status, 404, 'Unreviewed source cannot be copied');
  const approved = await json(curriculumPath + '/approve', 'teacher-a', 'POST', { versionId: created.latest.id, confirmReview: true });
  check(approved.approvedBy, 'teacher-a', 'Reference review attributes educator');
  check((await json(curriculumPath, 'teacher-other')).canManage, false, 'Peer reads approved reference without management authority');
  const snapshot = await json(curriculumPath + '/snapshot?versionId=' + approved.id, 'teacher-other');
  check(snapshot.suggestedDraft.body, content.body, 'Approved exact snapshot preserves original plain text');
  const copy = { versionId: approved.id, type: 'worksheet', clientResourceId: crypto.randomUUID() };
  const copied = await json(curriculumPath + '/draft', 'teacher-a', 'POST', copy, 201);
  check(copied.provenance.referenceVersionId, approved.id, 'Copied resource pins exact source provenance');
  check(copied.provenance.resourceVersionId, copied.resource.latest.id, 'Provenance pins exact draft version');
  check(copied.resource.latest.approvedAt, null, 'Source approval never approves copied teaching draft');
  check(await json(curriculumPath + '/draft', 'teacher-a', 'POST', copy, 201), copied, 'Exact source-copy retry preserves evidence');
  const resourcePath = '/api/resources/' + copied.resource.id;
  await json(resourcePath + '/approve', 'teacher-a', 'POST', { versionId: copied.resource.latest.id });
  const assigned = await json(resourcePath + '/assign', 'teacher-a', 'POST', { versionId: copied.resource.latest.id, classId: 'class-a', dueDate: '2020-01-01' }, 201);
  check(Object.hasOwn(assigned.resource, 'answerKey'), false, 'Assignment response omits answer key');
  check(Object.hasOwn(assigned.resource, 'teacherNotes'), false, 'Assignment response omits private notes');
  await json(curriculumPath, 'teacher-a', 'PATCH', { expectedVersion: 1, content: { ...content, body: 'Unreviewed source revision.' } });
  check((await json(curriculumPath, 'teacher-other')).latest.id, approved.id, 'Peer stays pinned to earlier approved source');
  await json(resourcePath, 'teacher-a', 'PATCH', { expectedVersion: 1, content: { ...copied.resource.latest, id: undefined, resourceId: undefined, version: undefined, createdBy: undefined, createdAt: undefined, approvedBy: undefined, approvedAt: undefined, body: 'New unreviewed resource draft.', teacherNotes: 'SERVED_PRIVATE_NOTE', answerKey: 'SERVED_PRIVATE_KEY' } });

  const submissionsPath = '/api/assignments/' + assigned.id + '/submissions';
  check((await request(submissionsPath, 'guardian-a')).status, 403, 'Guardian cannot inspect raw submissions');
  check((await request(submissionsPath, 'teacher-other')).status, 404, 'Unassigned teacher cannot inspect submissions');
  check((await request(submissionsPath, 'admin-b')).status, 404, 'Foreign school cannot inspect submissions');
  const learnerFeed = await json('/api/resource-assignments', 'student-user-a');
  const learnerAssignment = learnerFeed.find(item => item.id === assigned.id);
  check(learnerAssignment.resource.body, content.body, 'Learner receives assigned reviewed content, not later draft');
  check(JSON.stringify(learnerAssignment).includes('SERVED_PRIVATE_'), false, 'No private staff fields escape learner response');
  const attemptInput = { response: 'Synthetic explanation: one half is larger.', expectedAttempt: 0, clientSubmissionId: crypto.randomUUID() };
  const first = await json(submissionsPath, 'student-user-a', 'POST', attemptInput, 201);
  check(first.versionId, assigned.versionId, 'Response pins approved assigned version');
  check(first.studentId, 'student-a', 'Response uses server-linked learner profile');
  check(first.feedback.length, 0, 'Response creates no automatic feedback');
  check(await json(submissionsPath, 'student-user-a', 'POST', attemptInput, 201), first, 'Exact submission retry returns immutable attempt');
  const feedbackPath = submissionsPath + '/' + first.id + '/feedback';
  const reviewInput = { feedback: 'Explain the number of equal parts more clearly.', reviewed: true, expectedRevision: 0, clientFeedbackId: crypto.randomUUID() };
  const reviewed = await json(feedbackPath, 'teacher-a', 'POST', reviewInput, 201);
  check(reviewed.submissionId, first.id, 'Feedback targets exact saved attempt');
  check(reviewed.reviewedBy, 'teacher-a', 'Review attributes educator');
  check((await json(feedbackPath, 'student-user-a'))[0].id, reviewed.id, 'Learner reads reviewed feedback');
  const second = await json(submissionsPath, 'student-user-a', 'POST', { ...attemptInput, response: 'Synthetic revised explanation of equal parts.', expectedAttempt: 1, clientSubmissionId: crypto.randomUUID() }, 201);
  check(second.attempt, 2, 'Revised response appends a numbered attempt');
  check(second.feedback.length, 0, 'Feedback is not copied to another attempt');
  const attemptHistory = await json(submissionsPath, 'teacher-a');
  check(attemptHistory.find(item => item.id === first.id).feedback[0].id, reviewed.id, 'Earlier reviewed response preserved after new attempt');
  check((await request(submissionsPath, 'student-user-a', 'POST', { ...attemptInput, clientSubmissionId: crypto.randomUUID() })).status, 409, 'Stale attempt sequence conflicts');

  const readingInput = { classId: 'class-a', studentId: 'student-a', language: 'en-IN', passageReference: 'SYNTHETIC-READING-' + suffix,
    readingDate: '2026-10-05', durationSeconds: 60, wordsAttempted: 100, wordsCorrect: 90, clientCheckId: crypto.randomUUID() };
  const reading = await json('/api/reading-checks', 'teacher-a', 'POST', readingInput, 201);
  const correctionPath = '/api/reading-checks/' + reading.id + '/corrections';
  const correction = { language: readingInput.language, passageReference: readingInput.passageReference, readingDate: readingInput.readingDate, durationSeconds: 60,
    wordsAttempted: 100, wordsCorrect: 94, reason: 'Synthetic count transcription correction.', confirmReviewed: true, expectedRevision: 0, clientCorrectionId: crypto.randomUUID() };
  const corrected = await json(correctionPath, 'teacher-a', 'POST', correction, 201);
  check(corrected.wcpm, 94, 'Correction derives reviewed numeric rate');
  check(await json(correctionPath, 'teacher-a', 'POST', correction, 201), corrected, 'Exact correction retry preserves evidence');
  check((await request(correctionPath, 'teacher-a', 'POST', { ...correction, wordsCorrect: 101, clientCorrectionId: crypto.randomUUID() })).status, 400, 'Invalid reading counts fail before persistence');
  check((await request(correctionPath, 'teacher-a', 'POST', { ...correction, wordsCorrect: 93, clientCorrectionId: crypto.randomUUID() })).status, 409, 'Stale correction revision conflicts');
  for (const user of ['guardian-a', 'student-user-a']) check((await request('/api/reading-review?classId=class-a', user)).status, 403, 'Reading review stays private to staff');
  const readingView = await json('/api/reading-review?classId=class-a', 'teacher-a');
  const observed = readingView.observations.find(item => item.original.id === reading.id);
  check(observed.original.wordsCorrect, 90, 'Correction retains original observation');
  check(observed.effective.wordsCorrect, 94, 'Effective reading uses reviewed correction');
  check(observed.corrections.length, 1, 'Correction evidence retained');
  check((await json('/api/reading-review?classId=class-a', 'teacher-other')).observations.length, 0, 'Unassigned teacher sees no reading observations');
  await json('/api/enrolments', 'admin-a', 'PATCH', { id: 'student-a-enrolment', status: 'withdrawn' }); withdrew = true;
  check((await request(submissionsPath, 'student-user-a')).status, 404, 'Withdrawn learner loses assignment response access');
  const retained = await json('/api/reading-review?classId=class-a&studentId=student-a', 'teacher-a');
  check(retained.observations.some(item => item.original.id === reading.id), true, 'Assigned staff retain withdrawn learner reading history');
  await json('/api/enrolments', 'admin-a', 'PATCH', { id: 'student-a-enrolment', status: 'active' }); withdrew = false;
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0 }));
} catch (error) {
  console.log(JSON.stringify({ passed, failed: 1, skipped: 0 }));
  throw error;
} finally {
  if (withdrew) {
    const restored = await request('/api/enrolments', 'admin-a', 'PATCH', { id: 'student-a-enrolment', status: 'active' });
    if (!restored.ok) throw new Error('Failed to restore synthetic active enrolment after served checks.');
  }
}
