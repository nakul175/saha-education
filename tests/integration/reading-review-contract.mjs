import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const readings = await load('lib/education/reading-checks.ts');
const reviewService = await load('lib/education/reading-review.ts');
const reviewRoute = await load('app/api/reading-review/route.ts');
const correctionsRoute = await load('app/api/reading-checks/[id]/corrections/route.ts');
const { readingCorrections } = await load('db/reading-correction-schema.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const principals = Object.fromEntries([
  ['admin-a', 'admin', 'a'], ['admin-b', 'admin', 'b'], ['teacher-a', 'teacher', 'a'],
  ['teacher-other', 'teacher', 'a'], ['guardian-a', 'guardian', 'a'], ['student-user-a', 'student', 'a'],
].map(([id, role, schoolId]) => [id, { id, role, schoolId }]));
const sessions = {};
for (const id of Object.keys(principals)) sessions[id] = (await createSession(id)).split(';')[0];
const today = new Date().toISOString().slice(0, 10);
const readingInput = { classId: 'class-a', studentId: 'student-a', language: 'en-IN',
  passageReference: 'Synthetic passage A', readingDate: today, durationSeconds: 60,
  wordsAttempted: 100, wordsCorrect: 91 };
const original = await readings.createReadingCheck(principals['teacher-a'], readingInput);
const foreign = await readings.createReadingCheck(principals['admin-b'], { ...readingInput, classId: 'class-b', studentId: 'student-b' });
const untouchedOriginal = sqlite.prepare('SELECT * FROM reading_checks WHERE id=?').get(original.id);
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
async function rejects(action, pattern, message) { await assert.rejects(action, pattern, message); checks++; }
function correction(expectedRevision = 0, overrides = {}) {
  const { classId, studentId, ...metrics } = readingInput;
  void classId; void studentId;
  return { ...metrics, clientCorrectionId: crypto.randomUUID(), expectedRevision,
    confirmReviewed: true, reason: 'Educator checked the manually entered word count.', wordsCorrect: 88, ...overrides };
}
function request(user, method = 'GET', payload, path = '/api/reading-review', suppliedOrigin = origin) {
  const headers = { origin: suppliedOrigin };
  if (user) headers.cookie = sessions[user];
  const init = { method, headers };
  if (payload !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(payload); }
  return new Request(origin + path, init);
}
function call(method, user, payload, checkId = original.id, suppliedOrigin = origin) {
  return correctionsRoute[method](request(user, method, payload, '/api/reading-checks/' + checkId + '/corrections', suppliedOrigin),
    { params: Promise.resolve({ id: checkId }) });
}
async function review(user = 'teacher-a', query = '?studentId=student-a&classId=class-a') {
  const response = await reviewRoute.GET(request(user, 'GET', undefined, '/api/reading-review' + query));
  check(response.status, 200, 'Authorized reading review returned');
  check(response.headers.get('cache-control'), 'no-store', 'Private reading review is uncached');
  return response.json();
}
async function history(user = 'teacher-a', checkId = original.id) {
  const response = await call('GET', user, undefined, checkId);
  check(response.status, 200, 'Authorized correction history returned');
  return response.json();
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Reading review must not contact another app'); };
const originalDb = globalThis.__sahaTestDb;
try {
  check((await reviewRoute.GET(request(null))).status, 401, 'Anonymous review denied');
  for (const method of ['GET', 'POST']) check((await call(method, null, method === 'POST' ? correction() : undefined)).status, 401, 'Anonymous corrections denied');
  const forged = new Request(origin + '/api/reading-review', { headers: { cookie: 'saha_demo_role=admin', 'x-user-id': 'admin-a', 'x-school-id': 'a' } });
  check((await reviewRoute.GET(forged)).status, 401, 'Demo cookies and public headers grant no authority');
  for (const user of ['guardian-a', 'student-user-a']) {
    check((await reviewRoute.GET(request(user))).status, 403, 'Families cannot inspect unpublished reading review');
    for (const method of ['GET', 'POST']) check((await call(method, user, method === 'POST' ? correction() : undefined)).status, 403, 'Families cannot read or correct readings');
    const malformed = new Request(request(user, 'POST'), { body: '{invalid' });
    check((await correctionsRoute.POST(malformed, { params: Promise.resolve({ id: original.id }) })).status, 403, 'Role denied before correction body parsing');
  }
  check((await call('POST', 'teacher-a', correction(), original.id, 'https://attacker.example.invalid')).status, 403, 'Cross-origin corrections denied');
  const absentOrigin = request('teacher-a', 'POST', correction()); absentOrigin.headers.delete('origin');
  check((await correctionsRoute.POST(absentOrigin, { params: Promise.resolve({ id: original.id }) })).status, 403, 'Correction origin is required');
  for (const user of ['teacher-other', 'admin-b']) {
    for (const method of ['GET', 'POST']) check((await call(method, user, method === 'POST' ? correction() : undefined)).status, 404, 'Other class/school cannot access original correction history');
  }
  check((await call('POST', 'admin-a', correction(), foreign.id)).status, 404, 'Administrator cannot correct another school observation');
  check((await call('GET', 'teacher-a', undefined, 'missing')).status, 404, 'Missing reading returns safe not-found response');
  check(await history(), [], 'New observation has no corrections');
  let result = await review();
  check(result.observations.length, 1, 'Scoped original observation returned');
  check(result.observations[0].original, original, 'Original evidence retains its manual source and attribution');
  check(result.observations[0].revision, 0, 'Uncorrected original is revision zero');
  check(result.observations[0].effective.wordsCorrect, 91, 'Initial effective metrics equal original');
  check(result.series.length, 1, 'One comparable task series initially');
  check(result.series[0].points[0].revision, 0, 'Series indicates whether its point uses a correction');
  check((await review('teacher-other')).observations.length, 0, 'Unassigned teacher review filters cannot widen access');
  check((await review('admin-a', '?studentId=student-b')).observations.length, 0, 'Foreign student review filter returns no evidence');
  check((await review('admin-a', '?classId=class-b')).series.length, 0, 'Foreign class filter returns no series');
  await rejects(() => reviewService.getReadingReview({ ...principals['admin-a'], schoolId: undefined }), /School access required/, 'Missing-school principal fails closed');

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const invalid = [
    { wordsCorrect: 101 }, { wordsAttempted: 0 }, { wordsAttempted: 501 }, { wordsCorrect: -1 }, { wordsCorrect: 1.5 },
    { durationSeconds: 0.999 }, { durationSeconds: 3600.001 }, { durationSeconds: '60' },
    { readingDate: tomorrow }, { readingDate: '2026-02-30' }, { readingDate: '2026-2-03' },
    { language: 'english' }, { language: 'en_IN' }, { passageReference: '' }, { passageReference: 'x'.repeat(201) },
    { passageReference: '<script>' }, { passageReference: 'private\ntranscript' }, { clientCorrectionId: 'bad-key' },
    { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: 1000000 },
    { reason: '' }, { reason: 'x'.repeat(1001) }, { reason: 'hidden\u0000text' }, { reason: '<private>' },
    { confirmReviewed: false }, { confirmReviewed: undefined }, { wcpm: 999 }, { accuracy: 100 },
    { correctedBy: 'admin-a' }, { correctedAt: '2000-01-01' }, { schoolId: 'b' }, { classId: 'class-b' },
    { studentId: 'student-b' }, { sourceAppId: 'verified-provider' }, { provenance: 'automatic' },
    { audio: 'private' }, { transcript: 'private' }, { readingCheckId: foreign.id }, { revision: 8 },
  ];
  for (const patch of invalid) check((await call('POST', 'teacher-a', correction(0, patch))).status, 400, 'Invalid or spoofed correction payload denied');
  const malformed = new Request(request('teacher-a', 'POST'), { body: '{invalid' });
  check((await correctionsRoute.POST(malformed, { params: Promise.resolve({ id: original.id }) })).status, 400, 'Malformed correction body fails safely');
  const oversized = new Request(request('teacher-a', 'POST'), { body: ' '.repeat(128 * 1024 + 1) });
  check((await correctionsRoute.POST(oversized, { params: Promise.resolve({ id: original.id }) })).status, 400, 'Correction body is bounded to 128 KiB');
  await rejects(() => reviewService.appendReadingCorrection(principals['teacher-a'], original.id, correction(0, { durationSeconds: NaN })), /finite|nan/i, 'NaN rejected before storage');
  await rejects(() => reviewService.appendReadingCorrection(principals['teacher-a'], original.id, correction(0, { durationSeconds: Infinity })), /finite/i, 'Infinite duration rejected');
  check(sqlite.prepare('SELECT count(*) n FROM reading_corrections').get().n, 0, 'Invalid and unauthorized requests append nothing');
  check((await call('POST', 'teacher-a', correction(1))).status, 409, 'A missing predecessor cannot be skipped');

  const firstInput = correction(0, { durationSeconds: 60.001 });
  let response = await call('POST', 'teacher-a', firstInput);
  check(response.status, 201, 'Assigned teacher appends an explicitly reviewed correction');
  check(response.headers.get('cache-control'), 'no-store', 'Saved correction is uncached');
  const first = await response.json();
  check(first.id, firstInput.clientCorrectionId, 'Retry UUID becomes correction identity');
  check(first.readingCheckId, original.id, 'Correction references original observation');
  check(first.revision, 1, 'First immutable correction is revision one');
  check(first.correctedBy, 'teacher-a', 'Correction actor is authenticated staff');
  check(Number.isFinite(Date.parse(first.correctedAt)), true, 'Correction time is generated by server');
  check(first.reason, firstInput.reason, 'Attributable reason retained');
  check(first.durationMs, 60001, 'Correction duration is normalized to milliseconds');
  check(first.durationSeconds, 60.001, 'Normalized duration returned');
  check(first.wcpm, 88, 'Correct-word rate derived from corrected metrics');
  check(first.accuracy, 88, 'Accuracy derived from corrected counts');
  response = await call('POST', 'teacher-a', firstInput);
  check(response.status, 201, 'Exact correction retry succeeds');
  check(await response.json(), first, 'Retry retains original actor/time');
  for (const patch of [{ wordsCorrect: 89 }, { reason: 'A different reason.' }, { expectedRevision: 1 }]) {
    check((await call('POST', 'teacher-a', { ...firstInput, ...patch })).status, 409, 'Retry key cannot change normalized correction payload');
  }
  check((await call('POST', 'admin-a', firstInput)).status, 409, 'A different reviewer cannot claim a retry UUID');
  check((await call('POST', 'admin-b', firstInput, foreign.id)).status, 409, 'Cross-school UUID collision is not a successful replay');
  check((await call('POST', 'teacher-a', correction())).status, 409, 'Stale expected revision rejected');
  check(sqlite.prepare('SELECT count(*) n FROM reading_corrections').get().n, 1, 'Retries/conflicts retain one correction');
  result = await review();
  check(result.observations[0].original, original, 'Correction never replaces original observed evidence');
  check(result.observations[0].effective.wordsCorrect, 88, 'Latest corrected metrics shown separately');
  check(result.observations[0].revision, 1, 'Review identifies applied revision');
  check(result.observations[0].corrections, [first], 'Review retains attributable history');
  const secondInput = correction(1, { reason: 'Duration transcribed again from the reviewed activity.', wordsCorrect: 90 });
  response = await call('POST', 'admin-a', secondInput);
  check(response.status, 201, 'Own-school administrator appends correction');
  const second = await response.json();
  check(second.revision, 2, 'Correction advances exactly one revision');
  check(second.correctedBy, 'admin-a', 'Administrator attribution retained');
  check(await history(), [first, second], 'Oldest-first correction history preserves both revisions');
  response = await call('POST', 'teacher-a', firstInput);
  check(response.status, 201, 'Old exact retry still succeeds after later correction');
  check(await response.json(), first, 'Later correction cannot change old retry response');
  check(sqlite.prepare('SELECT * FROM reading_checks WHERE id=?').get(original.id), untouchedOriginal, 'Original database row remains byte-for-byte unchanged');
  assert.throws(() => sqlite.prepare('UPDATE reading_corrections SET words_correct=1 WHERE id=?').run(first.id), /immutable/, 'Database rejects revision overwrites'); checks++;
  assert.throws(() => sqlite.prepare('DELETE FROM reading_corrections WHERE id=?').run(first.id), /immutable/, 'Database rejects correction deletion'); checks++;

  const revisionRace = await Promise.all([
    call('POST', 'teacher-a', correction(2, { wordsCorrect: 82, reason: 'Concurrent reviewed count A.' })),
    call('POST', 'admin-a', correction(2, { wordsCorrect: 83, reason: 'Concurrent reviewed count B.' })),
  ]);
  check(revisionRace.map(row => row.status).sort(), [201, 409], 'Concurrent next revisions retain one winner');
  check((await history()).length, 3, 'Revision race appends exactly one correction');
  const retryRaceInput = correction(3, { wordsCorrect: 87 });
  const retryRace = await Promise.all([call('POST', 'teacher-a', retryRaceInput), call('POST', 'teacher-a', retryRaceInput)]);
  check(retryRace.map(row => row.status), [201, 201], 'Concurrent identical retries both succeed');
  const retryBodies = await Promise.all(retryRace.map(row => row.json()));
  check(retryBodies[0], retryBodies[1], 'Concurrent retries share one immutable correction');
  check((await history()).length, 4, 'Retry race inserts no duplicate');

  // Task comparability is exact and never pools different pupils or classes.
  await readings.createReadingCheck(principals['teacher-a'], { ...readingInput, readingDate: '2026-01-01', wordsCorrect: 79 });
  await readings.createReadingCheck(principals['teacher-a'], { ...readingInput, language: 'hi-IN' });
  await readings.createReadingCheck(principals['teacher-a'], { ...readingInput, passageReference: 'Synthetic passage B' });
  await readings.createReadingCheck(principals['teacher-a'], { ...readingInput, durationSeconds: 30 });
  sqlite.prepare("INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('other-in-a','student-other','class-a','active','2026-10-05','2026-10-05','2026-10-05')").run();
  await readings.createReadingCheck(principals['teacher-a'], { ...readingInput, studentId: 'student-other' });
  await readings.createReadingCheck(principals['teacher-other'], { ...readingInput, studentId: 'student-other', classId: 'class-other' });
  result = await review();
  check(result.observations.length, 5, 'Review includes the selected student/class only');
  check(result.series.length, 4, 'Language, passage and duration form separate groups');
  const comparable = result.series.find(row => row.language === 'en-IN' && row.passageReference === readingInput.passageReference && row.durationMs === 60000);
  check(comparable.points.length, 2, 'Only exactly comparable observations share a series');
  check(comparable.points.map(row => row.readingDate), ['2026-01-01', today], 'Comparable points use chronological reading dates');
  check(comparable.points.find(row => row.checkId === original.id).wordsCorrect, 87, 'Series uses latest explicitly corrected metrics');
  check(comparable.points.find(row => row.checkId === original.id).revision, 4, 'Series retains effective revision attribution');
  const wholeSchool = await review('admin-a', '');
  check(wholeSchool.series.length, 6, 'School review keeps student/class series separate');
  check(wholeSchool.observations.some(row => row.original.id === foreign.id), false, 'Whole-school history excludes another school');
  check(JSON.stringify(result).includes('diagnosis'), false, 'Review supplies no diagnostic classification');
  check(Object.keys(reviewRoute), ['GET'], 'Review exposes no publication/deletion endpoint');
  check(Object.keys(correctionsRoute).sort(), ['GET', 'POST'], 'Corrections expose append/read only');

  // Original class evidence stays reviewable when enrolment changes. No new
  // readings are silently created for withdrawn learners by this endpoint.
  sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='student-a'").run();
  check((await review()).observations.length, 5, 'Current assigned staff retain historical readings after withdrawal');
  check((await call('POST', 'teacher-a', correction(4))).status, 201, 'Staff can correct original historical reading after withdrawal');
  check((await history()).length, 5, 'Withdrawn correction appends rather than hiding history');
  check(await readings.listReadingChecks(principals['teacher-a'], { studentId: 'student-a' }), [], 'Original active-only reading service remains unchanged');
  check(sqlite.prepare('SELECT * FROM reading_checks WHERE id=?').get(original.id), untouchedOriginal, 'Historical correction still leaves original row untouched');

  function beforeInsert(mutate) {
    globalThis.__sahaTestDb = new Proxy(originalDb, { get(target, property) {
      if (property === 'insert') return table => {
        if (table === readingCorrections) { globalThis.__sahaTestDb = originalDb; mutate(); }
        return target.insert(table);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  beforeInsert(() => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run());
  check((await call('POST', 'teacher-a', correction(5))).status, 404, 'Class reassignment before INSERT prevents stale teacher correction');
  check((await call('GET', 'teacher-a')).status, 404, 'Former assigned teacher loses historical correction read');
  check((await history('teacher-other')).length, 5, 'New assigned teacher has historical scoped review');
  sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
  beforeInsert(() => sqlite.prepare("UPDATE users SET disabled_at='2026-10-05' WHERE id='teacher-a'").run());
  check((await call('POST', 'teacher-a', correction(5))).status, 404, 'Account disabled before INSERT prevents stale correction');
  check((await call('GET', 'teacher-a')).status, 401, 'Disabled staff session fails subsequent request');
  await rejects(() => reviewService.appendReadingCorrection(principals['teacher-a'], original.id, correction(5)), /not found/, 'Disabled principal cannot bypass live user predicate at service boundary');
  sqlite.prepare("UPDATE users SET disabled_at=NULL WHERE id='teacher-a'").run();
  beforeInsert(() => sqlite.prepare("UPDATE users SET role='guardian' WHERE id='teacher-a'").run());
  check((await call('POST', 'teacher-a', correction(5))).status, 404, 'Live role change before INSERT prevents staff correction');
  sqlite.prepare("UPDATE users SET role='teacher' WHERE id='teacher-a'").run();
  beforeInsert(() => sqlite.prepare("UPDATE users SET school_id='b' WHERE id='teacher-a'").run());
  check((await call('POST', 'teacher-a', correction(5))).status, 404, 'Live school change before INSERT prevents stale-school write');
  sqlite.prepare("UPDATE users SET school_id='a' WHERE id='teacher-a'").run();
  beforeInsert(() => sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run());
  check((await call('POST', 'admin-a', correction(5))).status, 404, 'Student school change before INSERT prevents correction');
  check((await review('admin-a')).observations.length, 0, 'Student transfer hides original school readings until policy is explicit');
  sqlite.prepare("UPDATE students SET school_id='a' WHERE id='student-a'").run();
  beforeInsert(() => sqlite.prepare("UPDATE classes SET school_id='b' WHERE id='class-a'").run());
  check((await call('POST', 'admin-a', correction(5))).status, 404, 'Class school change before INSERT prevents correction');
  sqlite.prepare("UPDATE classes SET school_id='a' WHERE id='class-a'").run();
  globalThis.__sahaTestDb = originalDb;
  check((await history()).length, 5, 'All authority races leave correction chain unchanged');
  const storedCorrection = sqlite.prepare('SELECT * FROM reading_corrections WHERE id=?').get(first.id);
  const columns = Object.keys(storedCorrection);
  const insert = sqlite.prepare(`INSERT INTO reading_corrections (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (const patch of [{ revision: 0 }, { revision: 1.5 }, { revision: 1000001 }, { reason: '' }, { duration_ms: 999 }, { words_correct: 101 }]) {
    const candidate = { ...storedCorrection, id: crypto.randomUUID(), revision: 50, ...patch };
    assert.throws(() => insert.run(...columns.map(column => candidate[column])), /CHECK constraint/, 'Database checks protect numeric correction invariants'); checks++;
  }
  assert.throws(() => insert.run(...columns.map(column => ({ ...storedCorrection, id: crypto.randomUUID(), revision: 50, reading_check_id: 'missing' })[column])), /FOREIGN KEY/, 'Database requires an original observation'); checks++;
  check(networkCalls, 0, 'Reading review/corrections never contact providers or send messages');
  console.log(`Reading review contract: ${checks} checks passed (actual authenticated routes and SQLite; immutable corrections and exact-task series; synthetic only).`);
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0 }));
} finally { globalThis.__sahaTestDb = originalDb; globalThis.fetch = originalFetch; sqlite.close(); }
