// Actual scoped sessions, SQLite and production D1 mapping; no percentage policy.
import assert from 'node:assert/strict';
import { freshDatabase, seedSecurityData, load, stamp } from '../support/security-db.mjs';
const fixture = freshDatabase();
const { db, schema, sqlite } = fixture;
await seedSecurityData(db, schema);
const service = await load('lib/education/attendance-summary.ts');
const sessions = await load('lib/education/session.ts');
const legacyAttendance = await load('lib/education/attendance.ts');
const route = await load('app/api/classes/[id]/attendance-summary/route.ts');
const actors = {}, cookies = {};
for (const id of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'guardian-a', 'guardian-other', 'student-user-a']) {
  cookies[id] = (await sessions.createSession(id)).split(';')[0];
  actors[id] = await sessions.principalForToken(cookies[id].slice(cookies[id].indexOf('=') + 1));
}
let checks = 0, networkCalls = 0;
const check = (actual, expected, name) => { assert.deepEqual(actual, expected, name); checks++; };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error('Only synthetic offline calls are permitted'); };
const read = (id, classId = 'class-a') => service.getAttendanceSummary(actors[id], classId);
async function isolated(action) {
  sqlite.exec('SAVEPOINT summary_case');
  try { await action(); } finally { globalThis.__sahaTestDb = db; sqlite.exec('ROLLBACK TO summary_case; RELEASE summary_case'); }
}
const insert = sqlite.prepare(`INSERT INTO attendance (id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at)
  VALUES (?,?,?,?,?,'PRIVATE saved attendance note','teacher-a',?,?)`);
try {
  check(service.ATTENDANCE_SUMMARY_LIMIT, 100, 'Pupil display bound is explicit');
  for (const id of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
    const view = await read(id);
    check(view.class, { id: 'class-a', name: 'class-a' }, 'Authorized class identified exactly');
    check(view.pupils.items.map(row => row.id), ['student-a'], 'Only the current authorized class pupil is visible');
    check(view.pupils.items[0].currentActive, true, 'Current enrolment is explicit');
    check(view.pupils.items[0].attendance, { recordedRows: 0, counts: { present: 0, absent: 0, late: 0, excused: 0, other: 0 }, firstDate: null, lastDate: null, invalidDateRows: 0 }, 'Unrecorded pupil has no inferred attendance or date coverage');
    check(Object.keys(view).sort(), ['asOf', 'class', 'pupils', 'role'], 'Compact class summary has no actor identity projection');
    check(Object.keys(view.pupils.items[0]).sort(), ['admissionNumber', 'attendance', 'currentActive', 'firstName', 'id', 'lastName'], 'No birth date, user mapping or staff notes are disclosed');
    check(Object.hasOwn(view.pupils.items[0].attendance, 'percentage'), false, 'No percentage/denominator is introduced');
    check(new Date(view.asOf).toISOString(), view.asOf, 'Snapshot time is canonical UTC');
  }
  for (const id of ['admin-b', 'teacher-other', 'guardian-other']) check(await read(id), null, 'Unrelated school/class/profile access is denied, not an empty authorized view');
  check(await read('admin-a', 'missing-class'), null, 'Missing class is unavailable');
  const context = { params: Promise.resolve({ id: 'class-a' }) };
  let response = await route.GET(new Request('https://education.example.invalid/api/classes/class-a/attendance-summary'), context);
  check(response.status, 401, 'Real route denies anonymous caller');
  check(response.headers.get('cache-control'), 'no-store', 'Denial is uncached');
  response = await route.GET(new Request('https://education.example.invalid/api/classes/class-a/attendance-summary', { headers: { cookie: cookies['teacher-a'] } }), context);
  check(response.status, 200, 'Actual authorized route returns snapshot');
  check((await response.json()).pupils.total, 1, 'Route projects actual scoped total');
  check(response.headers.get('cache-control'), 'no-store', 'Sensitive summary is uncached');
  response = await route.GET(new Request('https://education.example.invalid/api/classes/class-a/attendance-summary', { headers: { cookie: cookies['admin-b'] } }), context);
  check(response.status, 404, 'Foreign class route hides existence');
  await isolated(async () => {
    const rows = [['2026-10-01', 'present'], ['2026-10-02', 'absent'], ['2026-10-03', 'late'], ['2026-10-04', 'excused'], ['2026-10-05', 'legacy unknown'], ['2026-02-30', 'present'], ['not a date', 'excused']];
    rows.forEach(([date, status], index) => insert.run('summary-' + index, 'class-a', 'student-a', date, status, stamp, stamp));
    insert.run('foreign-pupil', 'class-a', 'student-b', '2026-10-05', 'present', stamp, stamp);
    insert.run('other-class', 'class-other', 'student-other', '2026-10-05', 'present', stamp, stamp);
    for (const id of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
      const view = await read(id), evidence = view.pupils.items[0].attendance;
      const oldRows = await legacyAttendance.listAttendance(actors[id], { classId: 'class-a' });
      check(evidence.recordedRows, oldRows.length, 'Observed row access matches the existing attendance service');
      check(evidence.recordedRows, 7, 'Foreign-school and other-class rows are excluded');
      check(evidence.counts, { present: 2, absent: 1, late: 1, excused: 2, other: 1 }, 'Each saved status remains explicit, including legacy unknown');
      check([evidence.firstDate, evidence.lastDate], ['2026-10-01', '2026-10-05'], 'Only actual calendar dates contribute to coverage');
      check(evidence.invalidDateRows, 2, 'Impossible and non-calendar legacy dates remain counted, not normalized silently');
      check(JSON.stringify(view).includes('PRIVATE'), false, 'Private attendance notes remain excluded');
      check(JSON.stringify(view).includes('student-b'), false, 'Foreign pupil names/IDs remain excluded');
    }
    check(sqlite.prepare('SELECT count(*) n FROM attendance').get().n, 9, 'Read leaves all original legacy/foreign evidence untouched');
  });
  await isolated(async () => {
    insert.run('excused-only', 'class-a', 'student-a', '2026-10-05', 'excused', stamp, stamp);
    const row = (await read('guardian-a')).pupils.items[0];
    check(row.attendance.counts.excused, 1, 'Excused-only evidence is a count, not red zero attendance');
    check(row.attendance.firstDate, '2026-10-05', 'Exact day is preserved independently of user timezone');
    sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'");
    const admin = await read('admin-a');
    check(admin.pupils.items[0].currentActive, false, 'Authorized historic records are distinguished from the current roster');
    check(admin.pupils.items[0].attendance.recordedRows, 1, 'Existing admin historical entitlement is retained');
    check((await read('teacher-a')).pupils.total, 0, 'No new teacher historical entitlement is introduced');
    check(await read('guardian-a'), null, 'Family class access still requires existing current active relationship');
    check(sqlite.prepare("SELECT status FROM attendance WHERE id='excused-only'").get().status, 'excused', 'Withdrawal does not erase evidence');
  });
  await isolated(async () => {
    const pupil = sqlite.prepare(`INSERT INTO students (id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at) VALUES (?,'a','Synthetic bounded',?,'2012-01-01',?,'8',?,?)`);
    const enrol = sqlite.prepare(`INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES (?,?,'class-a','active',?,?,?)`);
    for (let i = 0; i < 103; i++) { const id = 'summary-cap-' + String(i).padStart(3, '0'); pupil.run(id, id, id, stamp, stamp); enrol.run(id + '-enrolment', id, stamp, stamp, stamp); }
    const view = await read('teacher-a');
    check(view.pupils.total, 104, 'Exact pupil total is computed before display limit');
    check(view.pupils.items.length, 100, 'Rendered projection is bounded');
    check(view.pupils.truncated, true, 'Omission is disclosed');
    check(view.pupils.limit, 100, 'Limit appears in response');
    check((await read('teacher-a')).pupils.items.map(row => row.id), view.pupils.items.map(row => row.id), 'Bounded order is stable');
    check((await read('student-user-a')).pupils.total, 1, 'Class size cannot broaden family/learner roster');
  });
  const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
  let executed = 0, maxBinds = 0, atStatement;
  function prepared(query, params = []) {
    return { bind(...values) { maxBinds = Math.max(maxBinds, values.length); return prepared(query, values); },
      async raw() { executed++; const action = atStatement; atStatement = undefined; action?.(); const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...params); },
      async all() { executed++; return { success: true, results: sqlite.prepare(query).all(...params), meta: {} }; } };
  }
  const d1 = d1Drizzle({ prepare: prepared }, { schema });
  for (const id of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
    globalThis.__sahaTestDb = d1; const before = executed; const view = await read(id);
    check(executed - before, 1, 'Names, access and counts use one production D1 prepared SELECT');
    check(typeof view.pupils.items[0].attendance, 'object', 'Nested JSON maps as structured D1 response');
  }
  check(maxBinds <= 100, true, 'Prepared snapshot fits D1 parameter limit');
  for (const mutation of ["UPDATE users SET disabled_at='synthetic' WHERE id='admin-a'", "UPDATE users SET school_id='b' WHERE id='admin-a'", "UPDATE users SET role='teacher' WHERE id='admin-a'", "UPDATE users SET identity_subject='' WHERE id='admin-a'"]) await isolated(async () => {
    globalThis.__sahaTestDb = d1; atStatement = () => sqlite.exec(mutation);
    check(await read('admin-a'), null, 'Late actor change denies the whole snapshot');
  });
  await isolated(async () => { globalThis.__sahaTestDb = d1; atStatement = () => sqlite.exec("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"); check(await read('teacher-a'), null, 'Late class reassignment prevents all former class evidence'); });
  await isolated(async () => { globalThis.__sahaTestDb = d1; atStatement = () => sqlite.exec("UPDATE students SET user_id=NULL WHERE id='student-a'"); check(await read('student-user-a'), null, 'Late student unlink leaves no cached name or count'); });
  await isolated(async () => { globalThis.__sahaTestDb = d1; atStatement = () => sqlite.exec("UPDATE guardians SET user_id=NULL WHERE id='guardian-profile-a'"); check(await read('guardian-a'), null, 'Late guardian unlink leaves no cached child evidence'); });
  await isolated(async () => { globalThis.__sahaTestDb = d1; atStatement = () => sqlite.exec("UPDATE students SET school_id='b' WHERE id='student-a'"); check((await read('admin-a')).pupils.total, 0, 'Late pupil transfer excludes names/roster and records together'); });
  globalThis.__sahaTestDb = db;
  check(networkCalls, 0, 'No external provider or recipient calls');
  console.log(JSON.stringify({ passed: checks, failed: 0, skipped: 0, limits: 'Synthetic actual-session SQLite and production D1 query mapping; no browser, provider or hosted acceptance.' }));
} finally { globalThis.__sahaTestDb = db; globalThis.fetch = originalFetch; sqlite.close(); }
