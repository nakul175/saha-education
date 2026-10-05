import assert from 'node:assert/strict';
import { bindings, freshDatabase, seedSecurityData, load } from '../support/security-db.mjs';

const { db, schema, sqlite } = freshDatabase();
await seedSecurityData(db, schema);
const { createSession } = await load('lib/education/session.ts');
const service = await load('lib/education/reading-checks.ts');
const route = await load('app/api/reading-checks/route.ts');
const origin = 'https://education.example.invalid';
bindings.SAHA_ALLOWED_ORIGINS = origin;
const principals = Object.fromEntries([
  ['admin-a', 'admin', 'a'], ['admin-b', 'admin', 'b'], ['teacher-a', 'teacher', 'a'],
  ['teacher-other', 'teacher', 'a'], ['guardian-a', 'guardian', 'a'], ['student-user-a', 'student', 'a'],
].map(([id, role, schoolId]) => [id, { id, role, schoolId }]));
const sessions = {};
for (const id of Object.keys(principals)) sessions[id] = (await createSession(id)).split(';')[0];
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const input = { clientCheckId: '7f6b82c8-8b21-41e0-9fd0-f7f36b782851', classId: 'class-a', studentId: 'student-a',
  language: 'en-IN', passageReference: 'Passage A / level 2', readingDate: today,
  durationSeconds: 60.001, wordsAttempted: 100, wordsCorrect: 91 };
const foreign = { ...input, clientCheckId: '996a88f6-271d-4bd2-bdf1-76d8b7dcb067', classId: 'class-b', studentId: 'student-b' };
let checks = 0;
function check(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
async function rejects(fn, pattern, message) { await assert.rejects(fn, pattern, message); checks++; }
function request(id, method = 'GET', value, suppliedOrigin = origin, query = '') {
  const headers = { origin: suppliedOrigin };
  if (id) headers.cookie = sessions[id];
  const init = { method, headers };
  if (value !== undefined) { headers['content-type'] = 'application/json'; init.body = JSON.stringify(value); }
  return new Request(origin + '/api/reading-checks' + query, init);
}
const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error('Reading tracking must not contact another app'); };
try {
  for (const method of ['GET', 'POST']) check((await route[method](request(null, method, method === 'POST' ? input : undefined))).status, 401, 'Anonymous checks are denied');
  const legacy = new Request(origin + '/api/reading-checks', { headers: { cookie: 'saha_demo_role=admin' } });
  check((await route.GET(legacy)).status, 401, 'Role cookies are untrusted');
  for (const id of ['guardian-a', 'student-user-a']) {
    check((await route.GET(request(id))).status, 403, 'Unpublished readings are staff-only');
    check((await route.POST(request(id, 'POST', input))).status, 403, 'Families cannot record readings');
  }
  check((await route.POST(request('teacher-a', 'POST', input, 'https://attacker.example.invalid'))).status, 403, 'Cross-origin write is denied');
  const absentOrigin = request('teacher-a', 'POST', input); absentOrigin.headers.delete('origin');
  check((await route.POST(absentOrigin)).status, 403, 'Origin is mandatory');
  check((await route.POST(request('teacher-other', 'POST', input))).status, 404, 'Unassigned teacher cannot record');
  check((await route.POST(request('admin-a', 'POST', foreign))).status, 404, 'Cross-school write is denied');
  check((await route.POST(request('admin-a', 'POST', { ...input, studentId: 'student-other' }))).status, 400, 'Student must belong to selected class');
  check(sqlite.prepare('SELECT COUNT(*) AS count FROM reading_checks').get().count, 0, 'Denied writes leave no records');

  let response = await route.POST(request('teacher-a', 'POST', input));
  check(response.status, 201, 'Assigned teacher can record a reading');
  check(response.headers.get('cache-control'), 'no-store', 'Result is uncached');
  const record = await response.json();
  check(record.id, input.clientCheckId, 'Client retry UUID is preserved');
  check(record.schoolId, 'a', 'School comes from authenticated principal');
  check(record.recordedBy, 'teacher-a', 'Recorder comes from authenticated principal');
  check(record.sourceAppId, 'oral-reading-fluency', 'Fixed app category');
  check(record.provenance, 'manual-reviewed-external', 'Records manual review rather than automatic verification');
  check(record.durationMs, 60001, 'Duration is stored in integer milliseconds');
  check(record.durationSeconds, 60.001, 'Normalized duration is returned');
  check(record.wcpm, 91, 'Correct words/min is calculated by server');
  check(record.accuracy, 91, 'Accuracy is calculated by server');
  check(Number.isFinite(Date.parse(record.createdAt)), true, 'Timestamp is server generated');
  response = await route.POST(request('teacher-a', 'POST', input));
  check(response.status, 201, 'Exact retry succeeds');
  check(await response.json(), record, 'Retry preserves original timestamp and record');
  check(sqlite.prepare('SELECT COUNT(*) AS count FROM reading_checks').get().count, 1, 'Retry inserts no duplicate');
  response = await route.POST(request('teacher-a', 'POST', { ...input, wordsCorrect: 90 }));
  check(response.status, 409, 'Changed immutable retry payload is rejected');
  check(await response.json(), { error: 'Reading check conflict' }, 'Conflict response is safe');
  check((await route.POST(request('admin-a', 'POST', input))).status, 409, 'A different recorder cannot claim another actor retry key');
  check((await route.POST(request('admin-b', 'POST', { ...foreign, clientCheckId: input.clientCheckId }))).status, 409, 'A cross-school UUID collision is not treated as a successful replay');

  const second = await service.createReadingCheck(principals['admin-a'], { ...input, clientCheckId: undefined, durationSeconds: 30,
    wordsAttempted: 3, wordsCorrect: 2, passageReference: 'Second passage' });
  check(second.wcpm, 4, 'Correct-word rate uses duration rather than attempted words');
  check(second.accuracy, 67, 'Accuracy rounds consistently');
  await service.createReadingCheck(principals['admin-b'], foreign);
  check((await service.listReadingChecks(principals['admin-a'])).length, 2, 'School administrator sees own-school readings only');
  check((await service.listReadingChecks(principals['admin-b'])).length, 1, 'Other school has isolated readings');
  check((await service.listReadingChecks(principals['teacher-a'], { studentId: 'student-a', classId: 'class-a' })).length, 2, 'Assigned teacher has scoped history');
  check(await service.listReadingChecks(principals['teacher-other']), [], 'Unassigned teacher sees no reading records');
  check(await service.listReadingChecks(principals['admin-a'], { studentId: 'student-b' }), [], 'Foreign student filter cannot widen access');
  check((await route.GET(request('teacher-a', 'GET', undefined, origin, '?studentId=student-a&classId=class-a'))).status, 200, 'Staff history API works');
  for (const id of ['guardian-a', 'student-user-a']) await rejects(() => service.listReadingChecks(principals[id]), /staff only/, 'Services deny family history');
  await rejects(() => service.listReadingChecks({ ...principals['admin-a'], schoolId: undefined }), /School access required/, 'Missing-school principal fails closed');

  const invalid = [
    { wordsCorrect: 101 }, { wordsAttempted: 0 }, { wordsAttempted: 501 }, { wordsCorrect: -1 }, { wordsCorrect: 1.5 },
    { durationSeconds: 0.999 }, { durationSeconds: 3600.001 }, { durationSeconds: '60' },
    { readingDate: tomorrow }, { readingDate: '2026-02-30' }, { readingDate: '2026-2-03' },
    { language: 'english' }, { language: 'en_IN' }, { passageReference: '' }, { passageReference: 'x'.repeat(201) },
    { passageReference: '<script>' }, { passageReference: 'private\ntranscript' }, { clientCheckId: 'bad-key' },
    { wcpm: 999 }, { accuracy: 100 }, { recordedBy: 'admin-a' }, { schoolId: 'b' }, { sourceAppId: 'verified-provider' },
    { provenance: 'automatic' }, { audio: 'private' }, { transcript: 'private' }, { studentName: 'private' },
    { createdAt: '2000-01-01' }, { id: 'changed' },
  ];
  const before = sqlite.prepare('SELECT COUNT(*) AS count FROM reading_checks').get().count;
  for (const change of invalid) check((await route.POST(request('teacher-a', 'POST', { ...input, ...change }))).status, 400, 'Invalid or extra input cannot affect records');
  await rejects(() => service.createReadingCheck(principals['teacher-a'], { ...input, durationSeconds: NaN }), /finite|nan/i, 'NaN is rejected before insertion');
  await rejects(() => service.createReadingCheck(principals['teacher-a'], { ...input, durationSeconds: Infinity }), /finite/i, 'Infinite duration is rejected');
  check(sqlite.prepare('SELECT COUNT(*) AS count FROM reading_checks').get().count, before, 'Invalid submissions insert nothing');
  check(sqlite.prepare('SELECT words_correct FROM reading_checks WHERE id=?').get(input.clientCheckId).words_correct, 91, 'Conflicts leave immutable records intact');
  check(Object.keys(route).sort(), ['GET', 'POST'], 'No editing or deletion endpoint exists');
  const stored = sqlite.prepare('SELECT * FROM reading_checks WHERE id=?').get(input.clientCheckId);
  const columns = Object.keys(stored);
  const insertion = sqlite.prepare(`INSERT INTO reading_checks (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
  for (const invalidStored of [{ duration_ms: 999 }, { words_correct: 101 }, { provenance: 'automatically-verified' }]) {
    const candidate = { ...stored, id: crypto.randomUUID(), ...invalidStored };
    assert.throws(() => insertion.run(...columns.map(column => candidate[column])), /CHECK constraint/, 'Database constraints reject invalid numeric/provenance storage'); checks++;
  }
  sqlite.prepare('UPDATE enrolments SET status=? WHERE student_id=?').run('withdrawn', 'student-a');
  check(await service.listReadingChecks(principals['teacher-a']), [], 'Historical teacher visibility follows current active relationships');
  check((await route.POST(request('teacher-a', 'POST', { ...input, clientCheckId: undefined }))).status, 404, 'Withdrawn student cannot receive a new reading check');
  sqlite.prepare('UPDATE users SET disabled_at=? WHERE id=?').run(new Date().toISOString(), 'teacher-a');
  check((await route.GET(request('teacher-a'))).status, 401, 'Disabled staff sessions are revoked');
  check(networkCalls, 0, 'Recording and history never contact the external app');
  console.log(`Reviewed reading contract: ${checks} checks passed (real sessions and services with isolated SQLite; no external network or imported evidence).`);
  console.log(JSON.stringify({passed: checks, failed: 0, skipped: 0}));
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
