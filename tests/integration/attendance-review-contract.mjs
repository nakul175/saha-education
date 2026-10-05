// Reviewed attendance contracts: actual routes, opaque sessions and SQLite.
// Original replacement API remains separately callable with its old semantics.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDatabase, seedSecurityData, load, bindings, stamp, root } from '../support/security-db.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const session = await load('lib/education/session.ts');
const { attendanceReviews } = await load('db/attendance-reviews-schema.ts');
const route = await load('app/api/classes/[id]/attendance-editor/route.ts');
const historyRoute = await load('app/api/classes/[id]/attendance-editor/history/route.ts');
const legacy = await load('app/api/attendance/route.ts');
const parameters = id => ({ params: Promise.resolve({ id }) });
let passed = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
function status(response, expected, message) { check(response.status, expected, message); check(response.headers.get('cache-control'), 'no-store', message + ': no-store'); }
const input = (entries = [{ studentId: 'student-a', status: 'absent', note: null, expectedRecord: null }]) => ({
  date: '2026-10-05', clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic human reviewed attendance change.', entries });
const oldFetch = globalThis.fetch; globalThis.fetch = async () => { networkCalls++; throw new Error('Attendance review contracts are offline only.'); };

async function scenario(name, action, legacySetup) {
  const fixture = freshDatabase(legacySetup ? { beforeMigration: '0009_academic_integrity.sql' } : undefined);
  const baseDb = fixture.db; await seedSecurityData(baseDb, fixture.schema);
  if (legacySetup) {
    await legacySetup(fixture);
    const migrations = readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort();
    for (const file of migrations.slice(migrations.indexOf('0009_academic_integrity.sql'))) fixture.sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  const cookies = {};
  for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) cookies[actor] = (await session.createSession(actor)).split(';')[0];
  const request = (actor, method = 'GET', data, path = '/api/classes/class-a/attendance-editor?date=2026-10-05', selectedOrigin = origin) => new Request(origin + path, { method,
    headers: { ...(cookies[actor] ? { cookie: cookies[actor] } : {}), origin: selectedOrigin, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) });
  const snapshot = async (actor = 'teacher-a', date = '2026-10-05') => {
    const response = await route.GET(request(actor, 'GET', undefined, '/api/classes/class-a/attendance-editor?date=' + date), parameters('class-a'));
    status(response, 200, 'Authorized exact date snapshot'); return response.json();
  };
  const save = (data, actor = 'teacher-a', classId = 'class-a') => route.POST(request(actor, 'POST', data), parameters(classId));
  const history = (actor = 'teacher-a', path = '/api/classes/class-a/attendance-editor/history?date=2026-10-05', classId = 'class-a') => historyRoute.GET(request(actor, 'GET', undefined, path), parameters(classId));
  const count = table => fixture.sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  function beforeExecution(operation, table, mutation, ordinal = 1) {
    let seen = 0, injected = false;
    const chain = new Set(['select', 'where', 'limit', 'returning', 'onConflictDoNothing']);
    function wrap(query) { return new Proxy(query, { get(target, member) {
      if (member === 'then') return (fulfilled, rejected) => (async () => {
        if (!injected && ++seen === ordinal) { injected = true; globalThis.__sahaTestDb = baseDb; await mutation(); }
        return await target;
      })().then(fulfilled, rejected);
      const value = Reflect.get(target, member, target);
      if (typeof value !== 'function') return value;
      return (...args) => { const result = value.apply(target, args); return chain.has(member) && result && typeof result === 'object' ? wrap(result) : result; };
    } }); }
    globalThis.__sahaTestDb = new Proxy(baseDb, { get(target, member) {
      if (operation === 'read' && member === 'select') return (...args) => {
        const builder = target.select(...args);
        return new Proxy(builder, { get(query, property) {
          if (property === 'from') return selected => selected === table ? wrap(query.from(selected)) : query.from(selected);
          const value = Reflect.get(query, property, query); return typeof value === 'function' ? value.bind(query) : value;
        } });
      };
      if (member === operation) return (...args) => args[0] === table ? wrap(target[member](...args)) : target[member](...args);
      const value = Reflect.get(target, member, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    return () => { globalThis.__sahaTestDb = baseDb; check(injected, true, name + ': injected at actual SQL execution'); };
  }
  try { await action({ ...fixture, request, snapshot, save, history, count, beforeExecution }); scenarios++; }
  finally { globalThis.__sahaTestDb = baseDb; fixture.sqlite.close(); }
}

try {
  await scenario('Snapshot, empty history and first attributable review', async ({ snapshot, save, history, count, sqlite }) => {
    const current = await snapshot();
    check(current.class, { id: 'class-a', name: 'class-a' }, 'Class identity is scoped'); check(current.roster.total, 1, 'Roster exact active total');
    check(current.roster.items[0].record, null, 'No record means unrecorded, not present'); check(current.canReview, true, 'Unambiguous small active roster can be reviewed');
    check(Object.keys(current.roster.items[0].student).sort(), ['admissionNumber', 'firstName', 'id', 'lastName'], 'Roster omits private contacts and identity mapping');
    let response = await history(); status(response, 200, 'No backfilled history'); check(await response.json(), { items: [], total: 0, limit: 100, truncated: false }, 'Legacy absence is not invented as a review');
    const data = input(); response = await save(data); status(response, 201, 'First reviewed mark created'); const result = await response.json();
    check(result.replayed, false, 'Acknowledged creation is distinct from replay'); check(result.review.id, data.clientRequestId, 'Client UUID is durable review identity');
    check(result.review.reviewedBy, 'teacher-a', 'Review attribution comes from actor'); check(result.review.changes[0].beforeRecord, null, 'New mark has no fabricated before record');
    check(result.review.changes[0].afterRecord.status, 'absent', 'Explicit chosen status saved'); check(result.review.changes[0].afterRecord.note, null, 'Null note remains null');
    check(count('attendance_reviews'), 1, 'One batch receipt'); check(count('attendance_review_entries'), 1, 'One immutable entry'); check(count('attendance'), 1, 'One saved mark');
    check(sqlite.prepare('PRAGMA foreign_key_check').all(), [], 'Review and attendance foreign keys remain intact');
    check(Object.keys(result.review).sort(), ['changes', 'classId', 'createdAt', 'date', 'id', 'reason', 'reviewedBy'], 'Private fingerprint and pending payload omitted');
  });
  await scenario('Authentication role origin precede malformed or oversized bodies', async ({ request, count }) => {
    for (const actor of [null, 'guardian-a', 'student-user-a']) {
      status(await route.GET(request(actor), parameters('class-a')), actor === null ? 401 : 403, 'Snapshot staff boundary');
      status(await historyRoute.GET(request(actor), parameters('class-a')), actor === null ? 401 : 403, 'History staff boundary');
      status(await route.POST(request(actor, 'POST', '{'), parameters('class-a')), actor === null ? 401 : 403, 'Role checked before JSON');
    }
    status(await route.POST(request('teacher-a', 'POST', '{', '/api/attendance-editor', 'https://foreign.example.invalid'), parameters('class-a')), 403, 'Origin checked before JSON');
    status(await route.POST(request('teacher-a', 'POST', '{'), parameters('class-a')), 400, 'Authorized malformed JSON');
    status(await route.POST(request('teacher-a', 'POST', ' '.repeat(128 * 1024 + 1)), parameters('class-a')), 400, 'Streamed body size bound');
    check(count('attendance_reviews'), 0, 'Rejected requests leave no review');
  });
  for (const date of ['', '2026-02-30', '2025-02-29', '2026-13-01', '2026-10-5', 'not-a-date', '2026-10-05T00:00:00Z']) await scenario('Exact calendar rejection ' + date, async ({ request, save, count }) => {
    status(await route.GET(request('teacher-a', 'GET', undefined, '/api/editor?date=' + encodeURIComponent(date)), parameters('class-a')), 400, 'Invalid calendar snapshot rejected');
    status(await save({ ...input(), date }), 400, 'Invalid reviewed date rejected'); check(count('attendance'), 0, 'No invalid new reviewed date persists');
  });
  await scenario('Real leap and future dates do not invent school-calendar restrictions', async ({ snapshot, save }) => {
    for (const date of ['2024-02-29', '2100-01-01']) { check((await snapshot('teacher-a', date)).date, date, 'Real date accepted'); status(await save({ ...input(), date }), 201, 'Real future or leap review accepted'); }
  });
  await scenario('Strict input and explicit changed entries', async ({ save, count }) => {
    const original = input();
    for (const candidate of [
      { ...original, schoolId: 'b' }, { ...original, reviewedBy: 'admin-b' }, { ...original, reviewConfirmed: false }, { ...original, clientRequestId: 'not-uuid' },
      { ...original, reason: 'short' }, { ...original, reason: 'x'.repeat(501) }, { ...original, reason: 'Human review\nspoof' },
      { ...original, entries: [] }, { ...original, entries: [original.entries[0], original.entries[0]] },
      { ...original, entries: [{ ...original.entries[0], note: 'x'.repeat(2001) }] }, { ...original, entries: [{ ...original.entries[0], expectedRecord: undefined }] },
      { ...original, entries: [{ ...original.entries[0], recordedBy: 'admin-b' }] },
    ]) status(await save(candidate), 400, 'Invalid or spoofed reviewed packet rejected');
    check(count('attendance'), 0, 'Invalid packets do not mutate marks'); check(count('attendance_reviews'), 0, 'Invalid packets do not create audit evidence');
  });
  await scenario('Dirty-only replacement preserves untouched pupil and full before evidence', async ({ db, schema, request, snapshot, save, sqlite }) => {
    await db.insert(schema.enrolments).values({ id: 'other-current', studentId: 'student-other', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
    status(await legacy.POST(request('teacher-a', 'POST', { classId: 'class-a', date: '2026-10-05', entries: [{ studentId: 'student-a', status: 'absent', note: 'Original explanation' }, { studentId: 'student-other', status: 'excused', note: 'Untouched explanation' }] })), 200, 'Existing marks supplied by legacy workflow');
    const current = await snapshot(); const before = current.roster.items.find(row => row.student.id === 'student-a').record;
    const untouched = { ...sqlite.prepare("SELECT * FROM attendance WHERE student_id='student-other'").get() };
    status(await save(input([{ studentId: 'student-a', status: before.status, note: before.note, expectedRecord: before }])), 400, 'No-op is not a review event');
    const result = await save(input([{ studentId: 'student-a', status: 'late', note: '', expectedRecord: before }])); status(result, 201, 'Explicit changed mark reviewed'); const outcome = await result.json();
    check(outcome.review.changes[0].beforeRecord, before, 'Exact original note and attribution preserved'); check(outcome.review.changes[0].afterRecord.id, before.id, 'Existing attendance identity preserved');
    check(outcome.review.changes[0].afterRecord.createdAt, before.createdAt, 'Original creation evidence preserved'); check(outcome.review.changes[0].afterRecord.note, '', 'Explicit empty note remains empty');
    check({ ...sqlite.prepare("SELECT * FROM attendance WHERE student_id='student-other'").get() }, untouched, 'Untouched pupil status note actor and timestamps unchanged');
  });
  await scenario('Unicode reason and note limits match SQL code-point counts', async ({ save, count }) => {
    for (const reason of ['😀'.repeat(5), '😀'.repeat(501)]) status(await save({ ...input(), reason }), 400, 'Unicode reason outside code-point bounds is safe400');
    status(await save({ ...input(), reason: '😀'.repeat(10), entries: [{ ...input().entries[0], note: '😀'.repeat(2000) }] }), 201, 'Unicode minimum reason and maximum new note match database counts');
    status(await save({ ...input(), date: '2026-10-06', reason: '😀'.repeat(500) }), 201, 'Unicode maximum reason remains valid');
    status(await save({ ...input(), date: '2026-10-07', entries: [{ ...input().entries[0], note: '😀'.repeat(2001) }] }), 400, 'Unicode replacement note over limit rejected');
    check(count('attendance_reviews'), 2, 'Only valid Unicode reviews are committed');
  });
  await scenario('Long legacy note survives a reviewed status-only change', async ({ request, snapshot, save }) => {
    const note = 'Synthetic legacy explanation. '.repeat(120);
    status(await legacy.POST(request('teacher-a', 'POST', { classId: 'class-a', date: '2026-10-05', entries: [{ studentId: 'student-a', status: 'absent', note }] })), 200, 'Legacy long note supplied without changing legacy semantics');
    const before = (await snapshot()).roster.items[0].record;
    status(await save(input([{ studentId: 'student-a', status: 'late', note: note + ' changed', expectedRecord: before }])), 400, 'New oversized note is not accepted as preservation');
    const response = await save(input([{ studentId: 'student-a', status: 'late', note, expectedRecord: before }])); status(response, 201, 'Exactly unchanged oversized legacy note may be preserved');
    const review = (await response.json()).review;
    check(review.changes[0].beforeRecord.note, note, 'Long original note is retained in immutable before evidence');
    check(review.changes[0].afterRecord.note, note, 'Status correction preserves the complete existing note');
  });
  await scenario('Exact replay never reapplies after later legacy replacement or withdrawal', async ({ save, request, sqlite, count }) => {
    const data = input(); let response = await save(data); status(response, 201, 'Original review committed'); const first = await response.json();
    status(await legacy.POST(request('teacher-a', 'POST', { classId: 'class-a', date: data.date, entries: [{ studentId: 'student-a', status: 'present', note: 'Later legacy mark' }] })), 200, 'Later legacy replacement retains its established behavior');
    sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'").run();
    const later = { ...sqlite.prepare('SELECT * FROM attendance').get() };
    response = await save(data); status(response, 200, 'Original reviewed packet can be safely recovered'); const replay = await response.json();
    check(replay, { review: first.review, replayed: true }, 'Replay returns original committed evidence and time'); check({ ...sqlite.prepare('SELECT * FROM attendance').get() }, later, 'Replay does not restore the older reviewed mark');
    check(count('attendance_reviews'), 1, 'Replay does not append review'); check(count('attendance_review_entries'), 1, 'Replay does not append entry');
  });
  await scenario('UUID payload actor and class conflicts do not expose or replace review', async ({ save, request, count }) => {
    const data = input(); status(await save(data), 201, 'UUID originally used');
    status(await save({ ...data, reason: 'A different human review explanation.' }), 409, 'Same UUID different reason conflicts');
    status(await save({ ...data, entries: [{ ...data.entries[0], status: 'late' }] }), 409, 'Same UUID different desired mark conflicts');
    status(await save(data, 'admin-a'), 409, 'Another actor cannot recover this UUID');
    status(await route.POST(request('teacher-a', 'POST', data), parameters('class-b')), 404, 'Cross-school route unavailable'); check(count('attendance_reviews'), 1, 'Conflicts preserve original receipt');
  });
  for (const [label, change] of [
    ['actor disabled', "UPDATE users SET disabled_at='revoked' WHERE id='teacher-a'"], ['actor demoted', "UPDATE users SET role='student' WHERE id='teacher-a'"],
    ['actor moved', "UPDATE users SET school_id='b' WHERE id='teacher-a'"], ['issuer removed', "UPDATE users SET identity_issuer=NULL WHERE id='teacher-a'"],
    ['subject blank', "UPDATE users SET identity_subject='' WHERE id='teacher-a'"], ['class reassigned', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
    ['class transferred', "UPDATE classes SET school_id='b' WHERE id='class-a'"], ['pupil transferred', "UPDATE students SET school_id='b' WHERE id='student-a'"],
    ['pupil withdrawn', "UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'"],
  ]) await scenario('Mutation boundary ' + label, async ({ save, sqlite, beforeExecution, count }) => {
    const finish = beforeExecution('insert', attendanceReviews, () => sqlite.exec(change)); const response = await save(input()); finish();
    status(response, 409, 'Late changed authority or active membership conflicts'); check(count('attendance'), 0, 'No stale reviewed mark'); check(count('attendance_reviews'), 0, 'No stale receipt'); check(count('attendance_review_entries'), 0, 'No stale event');
  });
  for (const [field, value] of [['status', 'excused'], ['note', 'Later explanation'], ['recorded_by', 'admin-a'], ['created_at', 'later-created'], ['updated_at', 'later-updated']]) await scenario('Exact existing evidence CAS ' + field, async ({ save, snapshot, sqlite, beforeExecution }) => {
    status(await save(input()), 201, 'Original reviewed mark'); const expected = (await snapshot()).roster.items[0].record;
    const finish = beforeExecution('insert', attendanceReviews, () => sqlite.prepare(`UPDATE attendance SET ${field}=?`).run(value));
    status(await save(input([{ studentId: 'student-a', status: 'present', note: 'Reviewed replacement', expectedRecord: expected }])), 409, 'Any changed exact evidence conflicts'); finish();
    check(sqlite.prepare('SELECT count(*) n FROM attendance_reviews').get().n, 1, 'Conflict appends no second review');
  });
  await scenario('Same-clock legacy change conflicts despite equal updatedAt', async ({ save, snapshot, sqlite, beforeExecution }) => {
    status(await save(input()), 201, 'Original mark saved'); const before = (await snapshot()).roster.items[0].record;
    const finish = beforeExecution('insert', attendanceReviews, () => sqlite.prepare('UPDATE attendance SET status=?,note=? WHERE id=?').run('late', 'Same clock legacy evidence', before.id));
    status(await save(input([{ studentId: 'student-a', status: 'present', note: null, expectedRecord: before }])), 409, 'Full row evidence catches same-clock status/note change'); finish();
    check(sqlite.prepare('SELECT updated_at FROM attendance').get().updated_at, before.updatedAt, 'Race deliberately preserved identical timestamp');
  });
  await scenario('Unrecorded expectation conflicts with late legacy insert', async ({ save, request, beforeExecution, count }) => {
    const finish = beforeExecution('insert', attendanceReviews, async () => status(await legacy.POST(request('teacher-a', 'POST', { classId: 'class-a', date: '2026-10-05', entries: [{ studentId: 'student-a', status: 'excused', note: 'Concurrent legacy insert' }] })), 200, 'Real legacy winner inserted'));
    status(await save(input()), 409, 'Missing-row expectation cannot overwrite an inserted mark'); finish(); check(count('attendance_reviews'), 0, 'No new reviewed evidence for rejected loser');
  });
  await scenario('Nested same UUID publisher wins once', async ({ save, beforeExecution, count }) => {
    const data = input(); let winner;
    const finish = beforeExecution('insert', attendanceReviews, async () => { const response = await save(data); status(response, 201, 'Inner same UUID reviewer wins'); winner = await response.json(); });
    const response = await save(data); finish(); status(response, 200, 'Concurrent exact UUID loser recovers original');
    check(await response.json(), { review: winner.review, replayed: true }, 'Concurrent replay returns the winner exactly'); check(count('attendance'), 1, 'One durable attendance row'); check(count('attendance_reviews'), 1, 'One durable receipt'); check(count('attendance_review_entries'), 1, 'One durable immutable entry');
  });
  await scenario('Competing different UUID reviews use one original expected snapshot', async ({ save, beforeExecution, count }) => {
    const loser = input(), winner = input([{ ...loser.entries[0], status: 'excused' }]);
    const finish = beforeExecution('insert', attendanceReviews, async () => status(await save(winner), 201, 'Competing reviewer commits first'));
    status(await save(loser), 409, 'Different UUID cannot replace the competing evidence'); finish(); check(count('attendance_reviews'), 1, 'Only winning review persists');
  });
  await scenario('Forced event fault rolls back receipt all marks and events', async ({ db, schema, request, snapshot, save, sqlite, count }) => {
    await db.insert(schema.enrolments).values({ id: 'second-active', studentId: 'student-other', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
    status(await legacy.POST(request('teacher-a', 'POST', { classId: 'class-a', date: '2026-10-05', entries: [{ studentId: 'student-a', status: 'present', note: 'Preserved original explanation' }] })), 200, 'Existing mark supplied before fault');
    const expected = (await snapshot()).roster.items.find(row => row.student.id === 'student-a').record;
    const original = { ...sqlite.prepare("SELECT * FROM attendance WHERE student_id='student-a'").get() };
    sqlite.exec("CREATE TRIGGER synthetic_attendance_event_fault BEFORE INSERT ON attendance_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic event storage failure'); END");
    const data = input([{ studentId: 'student-a', status: 'absent', note: null, expectedRecord: expected }, { studentId: 'student-other', status: 'late', note: '', expectedRecord: null }]);
    const response = await save(data); status(response, 500, 'Unexpected event failure remains safe500'); check(await response.json(), { error: 'Internal server error' }, 'No SQL implementation or record fields leak');
    check(count('attendance'), 1, 'Fault rolls back the new pupil mark');
    check({ ...sqlite.prepare("SELECT * FROM attendance WHERE student_id='student-a'").get() }, original, 'Fault also rolls back replacement of existing status note actor and timestamps');
    for (const table of ['attendance_reviews', 'attendance_review_entries']) check(count(table), 0, 'Forced fault rolls back ' + table);
    sqlite.exec('DROP TRIGGER synthetic_attendance_event_fault'); status(await save(data), 201, 'Original UUID succeeds after fault removed'); check(count('attendance'), 2, 'Both marks atomically saved after recovery');
    for (const statement of ["UPDATE attendance_reviews SET reason='Changed reviewed reason'", 'DELETE FROM attendance_reviews', "UPDATE attendance_review_entries SET after_record='{}'", 'DELETE FROM attendance_review_entries']) { assert.throws(() => sqlite.exec(statement), /immutable/); passed++; }
  });
  await scenario('History current scope retained for withdrawal but removed on transfer', async ({ save, history, sqlite }) => {
    const data = input(); status(await save(data), 201, 'Review before history lifecycle'); sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'").run();
    let response = await history(); status(response, 200, 'Staff can read withdrawn same-school review'); check((await response.json()).total, 1, 'Withdrawal retains history');
    sqlite.prepare("UPDATE students SET school_id='b' WHERE id='student-a'").run(); response = await history(); status(response, 200, 'Current class history remains accessible'); check((await response.json()).items, [], 'Transferred pupil review evidence is removed from read scope');
    status(await save(data), 409, 'Transferred original evidence cannot be replayed into caller scope');
  });
  await scenario('Snapshot and history actual late read authority', async ({ save, request, sqlite, schema, beforeExecution }) => {
    status(await save(input()), 201, 'Review available before read race');
    let finish = beforeExecution('read', schema.classes, () => sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run());
    status(await route.GET(request('teacher-a'), parameters('class-a')), 404, 'Snapshot denies class reassigned at SELECT'); finish();
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-a'").run();
    finish = beforeExecution('read', schema.classes, () => sqlite.prepare("UPDATE users SET identity_subject='' WHERE id='teacher-a'").run());
    status(await historyRoute.GET(request('teacher-a'), parameters('class-a')), 404, 'History denies actor mapping changed at SELECT'); finish();
  });
  await scenario('No committed evidence response after postcommit actor revocation', async ({ save, sqlite, beforeExecution, count }) => {
    const finish = beforeExecution('read', attendanceReviews, () => sqlite.prepare("UPDATE users SET disabled_at='revoked' WHERE id='teacher-a'").run(), 2);
    status(await save(input()), 404, 'Readback does not release evidence to revoked actor'); finish();
    check(count('attendance_reviews'), 1, 'Completed atomic review is preserved despite denied readback'); check(count('attendance'), 1, 'Committed mark is preserved');
  });
  await scenario('Legacy ambiguity snapshot is distinct and reviewed writes blocked', async ({ snapshot, save, count, sqlite }) => {
    const current = await snapshot(); check(current.roster.total, 1, 'Distinct pupil count preserves duplicate pair evidence'); check(current.roster.items[0].enrolmentRows, 2, 'All active+withdrawn pair rows flagged'); check(current.roster.items[0].needsReview, true, 'Legacy ambiguity is visible'); check(current.canReview, false, 'Ambiguity disables reviewed writes');
    status(await save(input()), 409, 'Ambiguous class cannot receive reviewed write'); check(count('attendance_reviews'), 0, 'No ambiguous review receipt');
    assert.throws(() => sqlite.prepare('INSERT INTO enrolments VALUES(?,?,?,?,?,?,?)').run('third-pair', 'student-a', 'class-a', 'active', stamp, stamp, stamp), /saha_enrolment_pair_conflict/); passed++;
  }, async ({ db, schema }) => db.insert(schema.enrolments).values({ id: 'legacy-pair', studentId: 'student-a', classId: 'class-a', status: 'withdrawn', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp }));
  await scenario('Exact100 roster allows review and late101st pupil blocks atomic write', async ({ db, schema, snapshot, save, beforeExecution, count }) => {
    await db.insert(schema.students).values(Array.from({ length: 100 }, (_, index) => ({ id: 'cap-pupil-' + index, schoolId: 'a', firstName: 'Synthetic cap', lastName: String(index), dateOfBirth: '2012-01-01', admissionNumber: 'CAP-' + index, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
    await db.insert(schema.enrolments).values(Array.from({ length: 99 }, (_, index) => ({ id: 'cap-enrolment-' + index, studentId: 'cap-pupil-' + index, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
    check((await snapshot()).canReview, true, 'Exactly100 active pupils can be reviewed');
    const finish = beforeExecution('insert', attendanceReviews, () => db.insert(schema.enrolments).values({ id: 'cap-late', studentId: 'cap-pupil-99', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp }));
    status(await save(input()), 409, 'Late101st pupil blocks the entire reviewed mutation'); finish();
    const current = await snapshot(); check(current.roster.total, 101, 'Exact roster total exceeds the cap'); check(current.roster.items.length, 100, 'Snapshot display stays bounded'); check(current.roster.truncated, true, 'Incomplete inventory explicitly marked'); check(current.canReview, false, 'Truncation blocks reviewed write'); check(count('attendance'), 0, 'No partial mark on capped class');
  });
  await scenario('SQL calendar check protects direct review persistence', async ({ sqlite }) => {
    for (const date of ['2026-02-30', 'not-a-date']) { assert.throws(() => sqlite.prepare('INSERT INTO attendance_reviews VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(), 'a', 'class-a', date, 'teacher-a', 'Synthetic direct SQL review reason', 'synthetic-hash', JSON.stringify([{ studentId: 'student-a', attendanceId: crypto.randomUUID(), status: 'absent', note: null, expectedRecord: null }]), stamp), /attendance_reviews_date/); passed++; }
    check(sqlite.prepare('SELECT count(*) n FROM attendance').get().n, 0, 'Invalid direct SQL dates also leave no mark');
  });
  await scenario('Original concurrent replacement and omitted-note semantics preserved', async ({ request, sqlite, count }) => {
    const packet = { classId: 'class-a', date: 'synthetic-legacy-date', entries: [{ studentId: 'student-a', status: 'absent', note: 'Legacy explanation' }] };
    status(await legacy.POST(request('teacher-a', 'POST', packet)), 200, 'Legacy arbitrary date semantics retained');
    const responses = await Promise.all(['present', 'excused'].map(statusValue => legacy.POST(request('teacher-a', 'POST', { ...packet, entries: [{ studentId: 'student-a', status: statusValue }] }))));
    check(responses.map(response => response.status), [200, 200], 'Legacy concurrent replacements still both200'); check(sqlite.prepare('SELECT note FROM attendance').get().note, null, 'Legacy omitted note still clears'); check(count('attendance_reviews'), 0, 'Legacy writes are not falsely backfilled as reviews');
  });
  await scenario('Production D1 driver uses one atomic mutation and exact evidence replay', async ({ db, schema, sqlite, snapshot, save, history, count }) => {
    await db.insert(schema.enrolments).values({ id: 'd1-second-active', studentId: 'student-other', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
    const { drizzle } = await import('drizzle-orm/d1');
    const commands = []; let batchCalls = 0;
    function prepared(query, params = []) {
      async function run(arrayRows) {
        commands.push(query); const statement = sqlite.prepare(query);
        if (arrayRows) statement.setReturnArrays(true);
        if (statement.columns().length) return statement.all(...params);
        statement.run(...params); return [];
      }
      return { bind(...values) { return prepared(query, values); },
        async raw() { return run(true); }, async all() { return { success: true, results: await run(false), meta: {} }; },
        async run() { return { success: true, results: await run(false), meta: {} }; } };
    }
    globalThis.__sahaTestDb = drizzle({ prepare: prepared, async batch() { batchCalls++; throw new Error('Reviewed attendance must use one statement, not a batch.'); } }, { schema });
    const current = await snapshot(); check(current.roster.total, 2, 'D1 driver maps scalar JSON snapshot correctly');
    const data = input([{ studentId: 'student-a', status: 'absent', note: null, expectedRecord: null }, { studentId: 'student-other', status: 'late', note: '', expectedRecord: null }]);
    sqlite.exec("CREATE TRIGGER synthetic_d1_event_fault BEFORE INSERT ON attendance_review_entries WHEN NEW.student_id='student-other' BEGIN SELECT RAISE(ABORT,'synthetic D1 event failure'); END");
    status(await save(data), 500, 'D1 event failure has safe error response');
    for (const table of ['attendance', 'attendance_reviews', 'attendance_review_entries']) check(count(table), 0, 'D1 event fault rolls back ' + table);
    sqlite.exec('DROP TRIGGER synthetic_d1_event_fault'); commands.length = 0;
    let response = await save(data); status(response, 201, 'D1 reviewed batch commits'); const first = await response.json();
    check(first.review.changes.length, 2, 'D1 returning/readback maps both immutable entries');
    check(commands.filter(query => /^(insert|update|delete)\b/i.test(query)).length, 1, 'One actual D1 write supplies receipt marks and entries'); check(batchCalls, 0, 'No D1 batch needed');
    commands.length = 0; response = await save(data); status(response, 200, 'D1 exact committed UUID recovered');
    check(await response.json(), { review: first.review, replayed: true }, 'D1 replay returns original typed evidence'); check(commands.filter(query => /^(insert|update|delete)\b/i.test(query)).length, 0, 'D1 committed replay has no mutation');
    response = await history(); status(response, 200, 'D1 current-scoped history'); check((await response.json()).items, [first.review], 'D1 history keeps parsed objects and null before records');
  });
  check(networkCalls, 0, 'No external calls');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, networkCalls }));
} finally { globalThis.fetch = oldFetch; }
