// FR-03/FR-10/NFR-01: manual built-local-Worker result review and retained legacy evidence.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
const origin = process.env.SAHA_WORKER_TEST_URL, fixture = process.env.SAHA_WORKER_SESSION_FIXTURE, manifestPath = process.env.SAHA_WORKER_FIXTURE_MANIFEST;
if (!origin || !fixture || !manifestPath) throw new Error('Supply localhost Worker, private synthetic sessions and assessment manifest.');
const base = new URL(origin);
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('An exact localhost origin is required.');
if (statSync(fixture).mode & 0o077) throw new Error('Synthetic sessions must remain private.');
const sessions = JSON.parse(readFileSync(fixture, 'utf8')), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.synthetic !== true || !manifest.assessmentReview || manifest.assessmentReview.capActivePupils !== 101) throw new Error('Require the fully migrated synthetic assessment fixture.');
for (const user of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) assert.equal(typeof sessions[user], 'string');
let passed = 0, requests = 0;
const checks = [], suffix = crypto.randomUUID().slice(0, 8);
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); passed++; checks.push(name); console.log('ok - ' + name); };
async function request(path, user, method = 'GET', input, options = {}) {
  const url = new URL(path, base); assert.equal(url.origin, base.origin); requests++;
  const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(20000), headers: {
    ...(user ? { Cookie: sessions[user] } : {}), ...(method === 'GET' ? {} : { Origin: options.origin ?? base.origin, 'Content-Type': 'application/json' }),
  }, ...(input === undefined ? {} : { body: options.raw ? input : JSON.stringify(input) }) });
  return new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers });
}
async function json(path, user, method = 'GET', input, status = 200, options) {
  const response = await request(path, user, method, input, options);
  check(response.status, status, 'Expected local ' + method + ' ' + status);
  check(response.headers.get('cache-control'), 'no-store', 'Private result response is uncached');
  return response.json();
}
const endpoint = id => '/api/assessments/' + encodeURIComponent(id) + '/result-editor';
const named = kind => 'assessment-review-' + kind + '-assessment';
const snapshot = (id, user = 'teacher-a') => json(endpoint(id), user);
const history = (id, user = 'teacher-a') => json(endpoint(id) + '/history', user);
const row = (saved, studentId) => { const value = saved.roster.items.find(item => item.student.id === studentId); assert.ok(value); return value; };
const entry = (saved, studentId, score, changes = {}) => ({ studentId, score, grade: row(saved, studentId).record?.grade ?? null,
  feedback: row(saved, studentId).record?.feedback ?? null, expectedRecord: row(saved, studentId).record, ...changes });
const review = (saved, entries, changes = {}) => ({ clientRequestId: crypto.randomUUID(), reviewConfirmed: true,
  reason: 'Synthetic served result review ' + suffix, expectedAssessment: saved.assessment, entries, ...changes });
function report(failed) {
  const result = { executedAt: new Date().toISOString(), passed, failed, skipped: 0, requests, externalRequests: 0, checks,
    limits: ['Built localhost Worker with private synthetic sessions and final migrations only.',
      'Suffix records and dedicated served-score/long-text/historical fixtures may change; no base account or role changes.',
      'Metadata fault inputs use deliberately stale snapshots; actual query-time changes and forced rollback are separate integration evidence.',
      'No grade computation, school-calendar policy, family result publication, provider or hosted acceptance.'] };
  writeFileSync(process.env.SAHA_ASSESSMENT_WORKER_RESULTS || '/private/tmp/saha-assessment-worker-results.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ passed, failed, skipped: 0, requests, externalRequests: 0 }));
}
try {
  for (const path of [endpoint('assessment-a'), endpoint('assessment-a') + '/history']) await json(path, undefined, 'GET', undefined, 401);
  await json(endpoint('assessment-a'), undefined, 'POST', '{', 401, { raw: true });
  for (const user of ['guardian-a', 'student-user-a']) {
    await json(endpoint('assessment-a'), user, 'GET', undefined, 403);
    await json(endpoint('assessment-a') + '/history', user, 'GET', undefined, 403);
    await json(endpoint('assessment-a'), user, 'POST', '{', 403, { raw: true });
  }
  await json(endpoint('assessment-a'), 'teacher-a', 'POST', '{', 403, { raw: true, origin: 'https://foreign.example.invalid' });
  const original = await snapshot('assessment-a');
  for (const user of ['admin-b', 'teacher-other']) {
    await json(endpoint('assessment-a'), user, 'GET', undefined, 404);
    await json(endpoint('assessment-a') + '/history', user, 'GET', undefined, 404);
    await json(endpoint('assessment-a'), user, 'POST', review(original, [entry(original, 'student-a', 0)]), 404);
  }
  const cap = await snapshot(named('cap'));
  check([cap.roster.total, cap.roster.items.length, cap.roster.truncated, cap.canReview], [101, 100, true, false], '101-pupil cap is exact and blocks review');
  await json(endpoint(named('cap')), 'teacher-a', 'POST', review(cap, [entry(cap, cap.roster.items[0].student.id, 0)]), 409);
  check((await history(named('cap'))).total, 0, 'Capped review saves no evidence');
  for (const kind of ['legacy-result', 'legacy-enrolment']) {
    const saved = await snapshot(named(kind));
    check(saved.canReview, false, 'Current retained ambiguity blocks review');
    check(saved.roster.items.some(item => item.needsReview), true, 'Current ambiguity is disclosed');
    const ambiguous = saved.roster.items.find(item => item.needsReview);
    if (kind === 'legacy-result') check([ambiguous.resultRows, ambiguous.records.length, ambiguous.record], [2, 2, null], 'Neither duplicate result is chosen as the saved winner');
    await json(endpoint(named(kind)), 'teacher-a', 'POST', review(saved, [entry(saved, ambiguous.student.id, 0)]), 409);
    check((await history(named(kind))).total, 0, 'Ambiguous review appends no evidence');
  }
  const invalidMax = await snapshot(named('invalid-max'));
  check([invalidMax.invalidMaximum, invalidMax.canReview, invalidMax.assessment.maxScoreType], [true, false, 'text'], 'Malformed legacy maximum is explicit and cannot be coerced');
  await json(endpoint(named('invalid-max')), 'teacher-a', 'POST', review(invalidMax, [entry(invalidMax, 'student-a', 0)]), 409);
  const unsafeScore = await snapshot(named('unsafe-score')), unsafePupil = row(unsafeScore, 'student-a');
  check([unsafePupil.record.score, unsafePupil.record.scoreType, unsafePupil.needsReview, unsafeScore.canReview], ['9007199254740993', 'integer', true, false], 'Unsafe stored integer stays exact and read-only');
  await json(endpoint(named('unsafe-score')), 'teacher-a', 'POST', review(unsafeScore, [entry(unsafeScore, 'student-a', 0)]), 409);
  const unsafeMax = await snapshot(named('unsafe-max'));
  check([unsafeMax.assessment.maxScore, unsafeMax.assessment.maxScoreType, unsafeMax.invalidMaximum, unsafeMax.canReview], ['9007199254740993', 'integer', true, false], 'Unsafe legacy maximum stays exact and blocks review');
  const nonfiniteScore = await snapshot(named('nonfinite-score')), nonfinitePupil = row(nonfiniteScore, 'student-a');
  check([nonfinitePupil.record.score, nonfinitePupil.record.scoreType, nonfinitePupil.needsReview, nonfiniteScore.canReview], ['Inf', 'real', true, false], 'Nonfinite legacy score is explicit text and read-only');
  const nonfiniteMax = await snapshot(named('nonfinite-max'));
  check([nonfiniteMax.assessment.maxScore, nonfiniteMax.assessment.maxScoreType, nonfiniteMax.invalidMaximum, nonfiniteMax.canReview], ['Inf', 'real', true, false], 'Nonfinite legacy maximum remains visible without JSON null substitution');
  for (const kind of ['invalid-date', 'impossible-date']) {
    const saved = await snapshot(named(kind));
    check(saved.invalidDate, true, 'Invalid stored calendar value is flagged without a rendering exception');
    check(saved.canReview, true, 'Existing assessment date does not invent a new school-day eligibility rule');
  }
  const historyBefore = await json('/api/assessments/' + named('historical-result') + '/results', 'admin-a');
  const historical = await snapshot(named('historical-result'));
  check(historical.roster.total, 1, 'Only current active pupil is editable');
  check(historical.canReview, true, 'Unrelated withdrawn duplicates do not block current roster');
  const active = historical.roster.items[0];
  await json(endpoint(named('historical-result')), 'teacher-a', 'POST', review(historical, [entry(historical, active.student.id, (active.record?.score ?? -1) + 1)]), 201);
  const historyAfter = await json('/api/assessments/' + named('historical-result') + '/results', 'admin-a');
  check(historyAfter.filter(item => item.studentId === 'assessment-review-historical-result-student'), historyBefore.filter(item => item.studentId === 'assessment-review-historical-result-student'), 'Both withdrawn historical result rows remain unchanged');
  for (const [kind, expectedType] of [['served-invalid-score', 'text'], ['served-real-score', 'real']]) {
    const saved = await snapshot(named(kind)), existing = row(saved, 'student-a');
    check([existing.invalidResult, existing.record.scoreType], [true, expectedType], 'Actual malformed stored score retains its evidence/type');
    const outcome = await json(endpoint(named(kind)), 'teacher-a', 'POST', review(saved, [entry(saved, 'student-a', 0)]), 201);
    check(outcome.review.changes[0].beforeRecord, existing.record, 'Explicit zero repair retains exact original stored score');
    check([outcome.review.changes[0].afterRecord.score, outcome.review.changes[0].afterRecord.scoreType], [0, 'integer'], 'Explicit repair saves an integer zero without inferred grade');
  }
  const long = await snapshot(named('long-text')), longRow = long.roster.items[0];
  check([...longRow.record.grade].length > 2000 && [...longRow.record.feedback].length > 2000, true, 'Oversized original grade/feedback remain complete');
  const preserved = await json(endpoint(named('long-text')), 'teacher-a', 'POST', review(long, [entry(long, longRow.student.id, longRow.record.score + 1)]), 201);
  check([preserved.review.changes[0].afterRecord.grade, preserved.review.changes[0].afterRecord.feedback], [longRow.record.grade, longRow.record.feedback], 'Score-only review preserves original long grade/feedback exactly');

  const classroom = await json('/api/classes', 'admin-a', 'POST', { schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a', name: 'Synthetic served result ' + suffix, term: 'Synthetic term' }, 201);
  const students = [];
  for (const index of [0, 1]) {
    const student = await json('/api/students', 'admin-a', 'POST', { schoolId: 'a', firstName: 'Synthetic result', lastName: suffix + '-' + index, dateOfBirth: '2012-01-01', admissionNumber: 'AS-SERVED-' + suffix + '-' + index, gradeLevel: '8' }, 201);
    students.push(student);
    await json('/api/enrolments', 'admin-a', 'POST', { studentId: student.id, classId: classroom.id, status: 'active', enrolledAt: '2026-10-05' }, 201);
  }
  const assessment = await json('/api/assessments', 'teacher-a', 'POST', { classId: classroom.id, title: 'Synthetic served reviewed results ' + suffix, kind: 'quiz', maxScore: 20, date: '2026-10-05' }, 201);
  let saved = await snapshot(assessment.id);
  check(saved.roster.items.every(item => item.record === null), true, 'Unrecorded roster has no default score');
  const input = review(saved, [entry(saved, students[0].id, 0, { grade: null, feedback: '' })]);
  const outcome = await json(endpoint(assessment.id), 'teacher-a', 'POST', input, 201);
  check([outcome.review.changes[0].afterRecord.score, outcome.review.changes[0].afterRecord.grade, outcome.review.changes[0].afterRecord.feedback], [0, null, ''], 'Zero/null/empty meanings are saved distinctly');
  check((await json(endpoint(assessment.id), 'teacher-a', 'POST', input)).review, outcome.review, 'Exact committed request returns original receipt');
  saved = await snapshot(assessment.id);
  check(row(saved, students[1].id).record, null, 'Dirty-only save does not mark an untouched pupil');
  const beforeHistory = await history(assessment.id);
  for (const field of ['id', 'assessmentId', 'studentId', 'score', 'scoreType', 'grade', 'feedback', 'createdAt', 'updatedAt']) {
    const changed = structuredClone(row(saved, students[0].id).record);
    changed[field] = field === 'score' ? 1 : field === 'scoreType' ? 'real' : changed[field] == null ? 'Stale null' : String(changed[field]) + '-stale';
    await json(endpoint(assessment.id), 'teacher-a', 'POST', review(saved, [entry(saved, students[0].id, 2, { expectedRecord: changed }), entry(saved, students[1].id, 3)]), 409);
    check((await snapshot(assessment.id)).roster.items, saved.roster.items, 'Stale full-record field rejects every batch member: ' + field);
  }
  for (const field of ['id', 'classId', 'title', 'kind', 'maxScore', 'date', 'createdAt', 'updatedAt', 'maxScoreType']) {
    const metadata = { ...saved.assessment, [field]: field === 'maxScore' ? 19 : field === 'maxScoreType' ? 'real' : String(saved.assessment[field]) + '-stale' };
    await json(endpoint(assessment.id), 'teacher-a', 'POST', review(saved, [entry(saved, students[0].id, 2)], { expectedAssessment: metadata }), 409);
  }
  check(await history(assessment.id), beforeHistory, 'Rejected records/metadata append no result review history');
  for (const changes of [{ reason: '😀'.repeat(5) }, { reviewConfirmed: false }, { entries: [] }, { entries: [entry(saved, students[0].id, 2), entry(saved, students[0].id, 3)] }]) {
    await json(endpoint(assessment.id), 'teacher-a', 'POST', review(saved, [entry(saved, students[0].id, 2)], changes), 400);
  }
  for (const desired of [entry(saved, students[0].id, 0), entry(saved, students[0].id, 21), entry(saved, students[0].id, 0.5), entry(saved, students[0].id, -1), entry(saved, students[0].id, 1, { grade: '😀'.repeat(2001) })]) {
    await json(endpoint(assessment.id), 'teacher-a', 'POST', review(saved, [desired]), 400);
  }
  check(await history(assessment.id), beforeHistory, 'Invalid/no-op review preserves all confirmed evidence');
  const concurrent = review(saved, [entry(saved, students[1].id, 0, { grade: '', feedback: null })]);
  const pair = await Promise.all([request(endpoint(assessment.id), 'teacher-a', 'POST', concurrent), request(endpoint(assessment.id), 'teacher-a', 'POST', concurrent)]);
  check(pair.map(response => response.status).sort(), [200, 201], 'Concurrent exact UUID has one commit and one replay');
  const pairBodies = await Promise.all(pair.map(response => response.json()));
  check(pairBodies[0].review, pairBodies[1].review, 'Concurrent requests return the same original evidence');
  check((await history(assessment.id)).total, 2, 'Concurrent exact retry saves one additional review');
  await json('/api/assessments/' + assessment.id + '/results', 'teacher-a', 'POST', { results: [{ studentId: students[0].id, score: 17, grade: 'Later school supplied', feedback: 'Later educator edit' }] });
  check((await json(endpoint(assessment.id), 'teacher-a', 'POST', input)).review, outcome.review, 'Committed retry after a later legacy edit returns the original receipt');
  check(row(await snapshot(assessment.id), students[0].id).record.score, 17, 'Original receipt replay does not reapply an older score');
  await json(endpoint(assessment.id), 'teacher-a', 'POST', { ...input, reason: input.reason + ' changed' }, 409);
  await json(endpoint(assessment.id), 'admin-a', 'POST', input, 409);
  report(0);
} catch (error) { report(1); throw error; }
