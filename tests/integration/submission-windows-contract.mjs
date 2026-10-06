import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const resources = await load('lib/education/resources.ts');
const windowRoute = await load('app/api/assignments/[id]/submission-window/route.ts');
const historyRoute = await load('app/api/assignments/[id]/submission-window/history/route.ts');
const submissions = await load('app/api/assignments/[id]/submissions/route.ts');
const feedback = await load('app/api/assignments/[id]/submissions/[submissionId]/feedback/route.ts');
const { assignmentSubmissionWindows } = await load('db/submission-window-schema.ts');
const { submissionAttempts } = await load('db/submission-schema.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const sessions = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'student-user-a', 'student-user-other', 'student-user-b']) {
  sessions[id] = (await createSession(id)).split(';')[0];
}
const teacher = { id: 'teacher-a', role: 'teacher', schoolId: 'a' };
const content = { title: 'Synthetic window task', type: 'worksheet', curriculum: 'Synthetic curriculum', gradeLevel: '8',
  subject: 'Mathematics', language: 'en-IN', objectives: 'Explain a comparison.', body: 'Compare synthetic fractions.',
  teacherNotes: 'Private staff observation.', answerKey: 'Private staff answer.' };
const resource = await resources.createResource(teacher, { content });
await resources.approveResource(teacher, resource.id, resource.latest.id);
async function assignmentFor(assignedResource = resource, classId = 'class-a') {
  return resources.assignResource(teacher, assignedResource.id, { versionId: assignedResource.latest.id, classId, dueDate: '2020-01-01' });
}
async function newResource(title) {
  const result = await resources.createResource(teacher, { content: { ...content, title } });
  await resources.approveResource(teacher, result.id, result.latest.id);
  return result;
}
const assignment = await assignmentFor();
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
function policy(expectedRevision = 0, state = 'closed', closesAt = null, clientPolicyId = crypto.randomUUID()) {
  return { clientPolicyId, expectedRevision, state, closesAt, reviewConfirmed: true, reason: 'Synthetic reviewed submission access change.' };
}
function attempt(expectedAttempt = 0, response = 'Synthetic learner response.', clientSubmissionId = crypto.randomUUID()) {
  return { clientSubmissionId, expectedAttempt, response };
}
function request(user, method = 'GET', payload, suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin };
  if (user) headers.cookie = sessions[user];
  const init = { method, headers };
  if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(payload); }
  return new Request(origin + '/api/assignments/' + assignment.id + '/submission-window', init);
}
function call(route, method, user, payload, assignmentId = assignment.id, suppliedOrigin = origin, submissionId = 'missing') {
  return route[method](request(user, method, payload, suppliedOrigin), { params: Promise.resolve({ id: assignmentId, submissionId }) });
}
async function current(user = 'teacher-a', assignmentId = assignment.id) {
  const response = await call(windowRoute, 'GET', user, undefined, assignmentId);
  check(response.status, 200, 'Current window is available to authorized users');
  check(response.headers.get('cache-control'), 'no-store', 'Window reads remain uncached');
  return response.json();
}
async function reviewed(input, user = 'teacher-a', assignmentId = assignment.id) {
  const response = await call(windowRoute, 'POST', user, input, assignmentId);
  check(response.status, 201, 'Reviewed window change or exact replay is acknowledged');
  check(response.headers.get('cache-control'), 'no-store', 'Review acknowledgements remain uncached');
  return response.json();
}
async function closed(response, message) {
  check(response.status, 409, message);
  check(await response.json(), { error: 'Submission window closed', code: 'submission-window-closed' }, 'Window denial uses a safe specific conflict code');
}
function count(table, assignmentId = assignment.id) {
  return sqlite.prepare('SELECT count(*) n FROM ' + table + ' WHERE assignment_id=?').get(assignmentId).n;
}
const originalDb = globalThis.__sahaTestDb;
function beforeInsert(table, mutate) {
  let injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, { get(target, property) {
    if (property === 'insert') return insertedTable => {
      if (!injected && insertedTable === table) { injected = true; globalThis.__sahaTestDb = originalDb; mutate(); }
      return target.insert(insertedTable);
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return () => { globalThis.__sahaTestDb = originalDb; check(injected, true, 'Race was injected immediately before the actual INSERT'); };
}
function beforePolicyRead(occurrence, mutate) {
  let reads = 0, injected = false;
  globalThis.__sahaTestDb = new Proxy(originalDb, { get(target, property) {
    if (property === 'select') return (...args) => {
      const query = target.select(...args);
      return new Proxy(query, { get(builder, member) {
        if (member === 'from') return table => {
          if (table === schema.resourceAssignments && args[0]?.policy === assignmentSubmissionWindows && ++reads === occurrence) {
            injected = true; globalThis.__sahaTestDb = originalDb; mutate();
          }
          return builder.from(table);
        };
        const value = Reflect.get(builder, member, builder);
        return typeof value === 'function' ? value.bind(builder) : value;
      } });
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  return () => { globalThis.__sahaTestDb = originalDb; check(injected, true, 'Authority race was injected immediately before the scoped policy SELECT'); };
}
function rawPolicy(assignmentId, revision, state, closesAt = null) {
  sqlite.prepare('INSERT INTO assignment_submission_windows(id,assignment_id,revision,state,closes_at,reviewed_by,reviewed_at,reason,request_hash) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(crypto.randomUUID(), assignmentId, revision, state, closesAt, 'teacher-a', new Date().toISOString(), 'Synthetic concurrent staff review.', 'synthetic-hash');
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Window contract must remain local and synthetic'); };
try {
  for (const [route, methods] of [[windowRoute, ['GET', 'POST']], [historyRoute, ['GET']]]) {
    for (const method of methods) check((await call(route, method, null, method === 'POST' ? {} : undefined)).status, 401, 'Anonymous window access denied');
  }
  check((await call(windowRoute, 'POST', 'teacher-a', policy(), assignment.id, 'https://attacker.example.invalid')).status, 403, 'Window mutation requires matching origin');
  const forged = new Request(origin + '/api/assignments/' + assignment.id + '/submission-window', { headers: { cookie: 'saha_demo_role=admin', 'x-user-id': 'admin-a' } });
  check((await windowRoute.GET(forged, { params: Promise.resolve({ id: assignment.id }) })).status, 401, 'Forged public identity cannot read window');
  for (const user of ['guardian-a', 'student-user-a']) {
    check((await call(historyRoute, 'GET', user)).status, 403, 'Window review history is staff only');
    check((await call(windowRoute, 'POST', user, policy())).status, 403, 'Learners and guardians cannot review windows');
    const invalid = new Request(request(user, 'POST'), { body: '{invalid' });
    check((await windowRoute.POST(invalid, { params: Promise.resolve({ id: assignment.id }) })).status, 403, 'Wrong review role denied before body parsing');
  }
  check((await call(windowRoute, 'GET', 'guardian-a')).status, 403, 'Guardian denied raw submission-window access');
  for (const user of ['teacher-other', 'teacher-b', 'admin-b', 'student-user-other', 'student-user-b']) {
    check((await call(windowRoute, 'GET', user)).status, 404, 'Foreign class/school/learner window remains private');
    if (!user.startsWith('student-')) {
      check((await call(historyRoute, 'GET', user)).status, 404, 'Foreign staff cannot fetch policy history');
      check((await call(windowRoute, 'POST', user, policy())).status, 404, 'Foreign staff cannot append a policy');
    }
  }
  const unconfigured = await current('student-user-a');
  check(Object.keys(unconfigured).sort(), ['assignmentId', 'revision', 'state', 'closesAt', 'configured', 'acceptingSubmissions', 'asOf'].sort(), 'Student current view includes only safe policy summary');
  check({ ...unconfigured, asOf: undefined }, { assignmentId: assignment.id, revision: 0, state: 'open', closesAt: null, configured: false, acceptingSubmissions: true, asOf: undefined }, 'Absent policy preserves unrestricted original workflow');
  check(new Date(unconfigured.asOf).toISOString(), unconfigured.asOf, 'Current view has canonical timestamp');
  check((await current('admin-a')).acceptingSubmissions, true, 'Own-school administrator can inspect default window');
  let response = await call(historyRoute, 'GET', 'teacher-a');
  check(response.status, 200, 'Authorized unconfigured history returns successfully');
  check(await response.json(), [], 'No synthetic implicit policy row is created');
  const firstInput = attempt();
  response = await call(submissions, 'POST', 'student-user-a', firstInput);
  check(response.status, 201, 'Informational past due date does not prevent default submission');
  const first = await response.json();
  check(first.id, firstInput.clientSubmissionId, 'Original submission retains its UUID');

  const future = new Date(Date.now() + 86400000).toISOString();
  const invalidPolicies = [
    { ...policy(), clientPolicyId: 'invalid' }, { ...policy(), expectedRevision: -1 }, { ...policy(), expectedRevision: 1.5 },
    { ...policy(), expectedRevision: 1000000 }, { ...policy(), state: 'paused' }, { ...policy(), closesAt: undefined },
    { ...policy(), reviewConfirmed: false }, { ...policy(), reviewConfirmed: undefined }, { ...policy(), reason: 'short' },
    { ...policy(), reason: 'x'.repeat(501) }, { ...policy(), reason: 'Synthetic\nmultiline reason.' }, { ...policy(), reason: 'Synthetic\u0000bad reason.' },
    { ...policy(), reviewedBy: 'admin-a' }, { ...policy(), assignmentId: 'other' }, { ...policy(), state: 'closed', closesAt: future },
    ...['2026-02-30T00:00:00.000Z', '2025-02-29T00:00:00.000Z', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00.000+00:00', '2026-10-05', 'invalid', '2026-10-05T24:00:00.000Z'].map(closesAt => ({ ...policy(), state: 'open', closesAt })),
  ];
  for (const input of invalidPolicies) check((await call(windowRoute, 'POST', 'teacher-a', input)).status, 400, 'Strict reviewed bounded canonical-UTC policy required');
  const malformed = new Request(request('teacher-a', 'POST'), { body: '{invalid' });
  check((await windowRoute.POST(malformed, { params: Promise.resolve({ id: assignment.id }) })).status, 400, 'Malformed review JSON safely denied');
  const oversized = new Request(request('teacher-a', 'POST'), { body: ' '.repeat(128 * 1024 + 1) });
  check((await windowRoute.POST(oversized, { params: Promise.resolve({ id: assignment.id }) })).status, 400, 'Window body is bounded at 128 KiB');
  check(count('assignment_submission_windows'), 0, 'Rejected policies persist no review rows');
  check((await call(windowRoute, 'POST', 'teacher-a', policy(1))).status, 409, 'Stale first-policy revision cannot bypass CAS');
  const closeInput = policy();
  const closeResult = await reviewed(closeInput);
  check(closeResult.review.id, closeInput.clientPolicyId, 'Policy retry UUID is persisted');
  check(closeResult.review.reviewedBy, 'teacher-a', 'Policy reviewer comes from authenticated staff');
  check(closeResult.review.revision, 1, 'Policy starts at revision one');
  check(closeResult.review.reason, closeInput.reason, 'Policy review reason is retained');
  check('requestHash' in closeResult.review, false, 'Policy hash never leaves API');
  check(closeResult.window.configured, true, 'Explicit review configures window');
  check(closeResult.window.acceptingSubmissions, false, 'Closed policy blocks new responses');
  const learnerClosed = await current('student-user-a');
  check('reason' in learnerClosed || 'reviewedBy' in learnerClosed || 'requestHash' in learnerClosed, false, 'Learner current view contains no private review metadata');
  await closed(await call(submissions, 'POST', 'student-user-a', attempt(1)), 'Closed policy denies a new response');
  check(count('submission_attempts'), 1, 'Closed response denial persists no attempt');
  response = await call(submissions, 'POST', 'student-user-a', firstInput);
  check(response.status, 201, 'Prior committed submission UUID can replay after closure');
  check(await response.json(), first, 'Closed-window retry preserves original evidence');
  check((await call(submissions, 'POST', 'student-user-a', { ...firstInput, response: 'Changed retry.' })).status, 409, 'Closed-window retry cannot mutate saved response');
  const feedbackInput = { clientFeedbackId: crypto.randomUUID(), expectedRevision: 0, reviewed: true, feedback: 'Synthetic reviewed guidance after closure.' };
  response = await call(feedback, 'POST', 'teacher-a', feedbackInput, assignment.id, origin, first.id);
  check(response.status, 201, 'Staff can review saved response after closure');
  const savedFeedback = await response.json();
  response = await call(submissions, 'POST', 'student-user-a', firstInput);
  check(response.status, 201, 'Saved submission retry still works after feedback');
  const replayWithFeedback = await response.json();
  check(replayWithFeedback.feedback, [savedFeedback], 'Closed-window replay returns current reviewed feedback');
  check(replayWithFeedback.response, first.response, 'Feedback leaves original response unchanged');
  check((await call(windowRoute, 'POST', 'admin-a', closeInput)).status, 409, 'Another reviewer cannot claim policy UUID');
  check((await call(windowRoute, 'POST', 'teacher-a', { ...closeInput, reason: 'Different synthetic review reason.' })).status, 409, 'Changed policy retry conflicts');
  const reopenInput = policy(1, 'open');
  const reopened = await reviewed(reopenInput, 'admin-a');
  check(reopened.window.acceptingSubmissions, true, 'Reviewed reopening restores new response access');
  const oldReplay = await reviewed(closeInput);
  check(oldReplay.review, closeResult.review, 'Older policy UUID replay returns its immutable original review');
  check(oldReplay.window.revision, 2, 'Older UUID replay returns latest current policy revision');
  check(oldReplay.window.acceptingSubmissions, true, 'Older closure replay cannot override a later opening');
  check(count('assignment_submission_windows'), 2, 'Replaying old policy creates no extra revisions');
  const secondInput = attempt(1, 'Synthetic reopened response.');
  response = await call(submissions, 'POST', 'student-user-a', secondInput);
  check(response.status, 201, 'Reopened policy accepts next response');
  const second = await response.json();
  check(second.attempt, 2, 'Reopening preserves response numbering');
  const timed = await reviewed(policy(2, 'open', future));
  check(timed.window.acceptingSubmissions, true, 'Future canonical cutoff accepts new submissions');
  const past = sqlite.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') value").get().value;
  const elapsed = await reviewed(policy(3, 'open', past));
  check(elapsed.window.state, 'open', 'Elapsed cutoff preserves explicitly reviewed policy state');
  check(elapsed.window.acceptingSubmissions, false, 'Elapsed cutoff closes new responses');
  await closed(await call(submissions, 'POST', 'student-user-a', attempt(2)), 'Elapsed cutoff denies new response with explicit closure code');
  check(count('submission_attempts'), 2, 'Timed closure preserves prior attempts only');
  await reviewed(policy(4, 'open'));

  const race = await Promise.all([
    call(windowRoute, 'POST', 'teacher-a', policy(5, 'closed')),
    call(windowRoute, 'POST', 'admin-a', policy(5, 'open')),
  ]);
  check(race.map(row => row.status).sort(), [201, 409], 'Concurrent policy revisions have exactly one CAS winner');
  check(count('assignment_submission_windows'), 6, 'Concurrent review appends only one revision');
  const retryInput = policy(6, 'open');
  const sameRace = await Promise.all([call(windowRoute, 'POST', 'teacher-a', retryInput), call(windowRoute, 'POST', 'teacher-a', retryInput)]);
  check(sameRace.map(row => row.status), [201, 201], 'Concurrent exact policy retries both acknowledge one review');
  const sameBodies = await Promise.all(sameRace.map(row => row.json()));
  check(sameBodies[0].review, sameBodies[1].review, 'Concurrent retry returns one immutable review');
  check(count('assignment_submission_windows'), 7, 'Concurrent identical retry appends exactly once');
  response = await call(historyRoute, 'GET', 'teacher-a');
  check(response.status, 200, 'Assigned teacher reads review history');
  const history = await response.json();
  check(history.map(row => row.revision), [7, 6, 5, 4, 3, 2, 1], 'History preserves every review newest first');
  check(history.at(-1), closeResult.review, 'Earlier closure review remains immutable');
  check(history.some(row => 'requestHash' in row), false, 'History omits every request hash');
  assert.throws(() => sqlite.prepare('UPDATE assignment_submission_windows SET state=? WHERE id=?').run('open', closeInput.clientPolicyId)); checks++;
  assert.throws(() => sqlite.prepare('DELETE FROM assignment_submission_windows WHERE id=?').run(closeInput.clientPolicyId)); checks++;
  check(count('assignment_submission_windows'), 7, 'Immutability triggers preserve history');

  // Close after prevalidation, immediately before the actual attempt INSERT.
  let finish = beforeInsert(submissionAttempts, () => rawPolicy(assignment.id, 8, 'closed'));
  await closed(await call(submissions, 'POST', 'student-user-a', attempt(2)), 'Closure race cannot pass the actual attempt INSERT');
  finish();
  check(count('submission_attempts'), 2, 'Closure race persists no response');
  response = await call(submissions, 'POST', 'student-user-a', secondInput);
  check(response.status, 201, 'Committed UUID replay survives a concurrent later closure');
  check((await response.json()).id, second.id, 'Closure race preserves committed attempt identity');
  await reviewed(policy(8, 'open'));
  finish = beforeInsert(submissionAttempts, () => rawPolicy(assignment.id, 10, 'open', past));
  await closed(await call(submissions, 'POST', 'student-user-a', attempt(2)), 'Elapsed cutoff introduced after prevalidation denies actual INSERT');
  finish();
  check(count('submission_attempts'), 2, 'Timed expiry race creates no response');

  const raceResource = await newResource('Synthetic policy authority race task');
  const raceAssignment = await assignmentFor(raceResource);
  for (const [label, mutate, restore] of [
    ['disabled actor', () => sqlite.prepare("UPDATE users SET disabled_at='synthetic-revoked' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run()],
    ['changed role', () => sqlite.prepare("UPDATE users SET role='guardian' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET role='teacher' WHERE id='teacher-a'").run()],
    ['changed school', () => sqlite.prepare("UPDATE users SET school_id='b' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET school_id='a' WHERE id='teacher-a'").run()],
    ['removed issuer', () => sqlite.prepare("UPDATE users SET identity_issuer='' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET identity_issuer='https://identity.example.invalid' WHERE id='teacher-a'").run()],
    ['removed subject', () => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET identity_subject='sub-teacher-a' WHERE id='teacher-a'").run()],
    ['class reassignment', () => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(), () => sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run()],
    ['class school transfer', () => sqlite.prepare("UPDATE classes SET school_id='b' WHERE id='class-a'").run(), () => sqlite.prepare("UPDATE classes SET school_id='a' WHERE id='class-a'").run()],
    ['resource school transfer', () => sqlite.prepare('UPDATE teaching_resources SET school_id=? WHERE id=?').run('b', raceResource.id), () => sqlite.prepare('UPDATE teaching_resources SET school_id=? WHERE id=?').run('a', raceResource.id)],
    ['assigned version approval withdrawn', () => sqlite.prepare('UPDATE resource_versions SET approved_at=NULL,approved_by=NULL WHERE id=?').run(raceResource.latest.id), () => sqlite.prepare('UPDATE resource_versions SET approved_at=?,approved_by=? WHERE id=?').run(new Date().toISOString(), 'teacher-a', raceResource.latest.id)],
  ]) {
    finish = beforeInsert(assignmentSubmissionWindows, mutate);
    response = await call(windowRoute, 'POST', 'teacher-a', policy(), raceAssignment.id);
    finish();
    check(response.status, 404, label + ' before actual policy INSERT denies write');
    check(count('assignment_submission_windows', raceAssignment.id), 0, label + ' race persists no review');
    check(await response.json(), { error: 'Not found' }, 'Denied policy write leaks no review metadata');
    restore();
  }

  // Live authority is checked by current, history, and replay evidence SELECTs.
  for (const [route, occurrence, input, label, mutate, restore] of [
    [windowRoute, 1, undefined, 'current read revoked', () => sqlite.prepare("UPDATE users SET disabled_at='synthetic-revoked' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run()],
    [historyRoute, 2, undefined, 'history class reassigned', () => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run(), () => sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run()],
    [windowRoute, 2, closeInput, 'replay identity removed', () => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET identity_subject='sub-teacher-a' WHERE id='teacher-a'").run()],
    [windowRoute, 3, closeInput, 'replay current-window read revoked', () => sqlite.prepare("UPDATE users SET disabled_at='synthetic-revoked' WHERE id='teacher-a'").run(), () => sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run()],
  ]) {
    finish = beforePolicyRead(occurrence, mutate);
    response = await call(route, input ? 'POST' : 'GET', 'teacher-a', input);
    finish();
    check(response.status, 404, label + ' denies fresh policy evidence');
    check(await response.json(), { error: 'Not found' }, 'Denied downstream policy query returns only safe error');
    restore();
  }
  finish = beforePolicyRead(1, () => sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a' AND class_id='class-a'").run());
  response = await call(windowRoute, 'GET', 'student-user-a');
  finish();
  check(response.status, 404, 'Withdrawal immediately before current-window read denies learner access');
  sqlite.prepare("UPDATE enrolments SET status='active' WHERE student_id='student-a' AND class_id='class-a'").run();
  check(sqlite.prepare('SELECT response FROM submission_attempts WHERE id=?').get(first.id).response, first.response, 'All policy changes and denied races retain original response');
  check(sqlite.prepare('SELECT feedback FROM submission_feedback WHERE id=?').get(savedFeedback.id).feedback, savedFeedback.feedback, 'All policy changes and denied races retain reviewed feedback');

  const boundedAssignment = await assignmentFor(await newResource('Synthetic bounded window history task'));
  for (let revision = 1; revision <= 102; revision++) rawPolicy(boundedAssignment.id, revision, revision % 2 ? 'closed' : 'open');
  response = await call(historyRoute, 'GET', 'admin-a', undefined, boundedAssignment.id);
  check(response.status, 200, 'Own-school administrator reads bounded review history');
  const bounded = await response.json();
  check(bounded.length, 100, 'History limits itself to latest 100 reviews');
  check([bounded[0].revision, bounded.at(-1).revision], [102, 3], 'Bounded history orders by newest revision');
  check((await current('student-user-a', boundedAssignment.id)).revision, 102, 'Current view selects latest revision independently of history bound');
  check(networkCalls, 0, 'No providers, notifications, or external requests');
  console.log(`Submission windows contract: ${checks} checks passed (real authenticated routes and SQLite; immutable reviewed policies, actual-write window enforcement, scoped history and exact retries; synthetic only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.__sahaTestDb = originalDb; globalThis.fetch = originalFetch; sqlite.close(); }
