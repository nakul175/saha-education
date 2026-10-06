// Independent summary boundaries: actual sessions/routes and the production D1
// driver over SQLite. Historical access is compared with existing attendance,
// rather than inventing a new family/teacher publication policy.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { freshDatabase, seedSecurityData, load, stamp, root } from '../support/security-db.mjs';
import { drizzle } from 'drizzle-orm/d1';
const sessions = await load('lib/education/session.ts');
const profileLinks = await load('lib/education/profile-links.ts');
const legacy = await load('lib/education/attendance.ts');
const route = await load('app/api/classes/[id]/attendance-summary/route.ts');
const origin = 'https://education.example.invalid';
const roles = [['admin-a', 'admin'], ['teacher-a', 'teacher'], ['guardian-a', 'guardian'], ['student-user-a', 'student']];
let passed = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const oldFetch = globalThis.fetch; globalThis.fetch = async () => { networkCalls++; throw new Error('Only local synthetic summary contracts are permitted.'); };

async function scenario(name, action, legacySetup) {
  const fixture = freshDatabase(legacySetup ? { beforeMigration: '0009_academic_integrity.sql' } : undefined);
  const { db, schema, sqlite } = fixture; await seedSecurityData(db, schema);
  if (legacySetup) {
    await legacySetup(fixture);
    const migrations = readdirSync(join(root, 'drizzle')).filter(file => /^\d.*\.sql$/.test(file)).sort();
    for (const file of migrations.slice(migrations.indexOf('0009_academic_integrity.sql'))) sqlite.exec(readFileSync(join(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  await db.insert(schema.enrolments).values({ id: 'summary-second-active', studentId: 'student-other', classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp });
  await db.insert(schema.studentGuardians).values({ studentId: 'student-other', guardianId: 'guardian-profile-a', isPrimary: 0 });
  await db.insert(schema.attendance).values([
    ['summary-first', 'student-a', 'present'], ['summary-second', 'student-other', 'excused'], ['summary-foreign', 'student-b', 'present'],
  ].map(([id, studentId, status]) => ({ id, studentId, classId: 'class-a', date: '2026-10-01', status, note: 'PRIVATE_ATTENDANCE_NOTE', recordedBy: 'teacher-a', createdAt: stamp, updatedAt: stamp })));
  const cookies = {}, principals = {};
  for (const [actor] of roles) {
    cookies[actor] = (await sessions.createSession(actor)).split(';')[0];
    principals[actor] = await sessions.principalForToken(cookies[actor].slice(cookies[actor].indexOf('=') + 1));
  }
  let atSnapshot, snapshotStatements = 0, allStatements = 0, nesting = false;
  function prepared(query, params = []) {
    async function execute(arrays) {
      allStatements++;
      if (!nesting && /from\s+"classes"/i.test(query)) {
        snapshotStatements++;
        const mutation = atSnapshot; atSnapshot = undefined;
        if (mutation) { nesting = true; try { await mutation(); } finally { nesting = false; } }
      }
      const statement = sqlite.prepare(query);
      if (arrays) statement.setReturnArrays(true);
      if (statement.columns().length) return statement.all(...params);
      statement.run(...params); return [];
    }
    return { bind(...values) { return prepared(query, values); }, async raw() { return execute(true); },
      async all() { return { success: true, results: await execute(false), meta: {} }; },
      async run() { return { success: true, results: await execute(false), meta: {} }; } };
  }
  const d1 = drizzle({ prepare: prepared, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } }, { schema });
  globalThis.__sahaTestDb = d1;
  const request = actor => new Request(origin + '/api/classes/class-a/attendance-summary', { headers: { ...(cookies[actor] ? { cookie: cookies[actor] } : {}) } });
  async function read(actor, mutation, expected = 200, classId = 'class-a') {
    atSnapshot = mutation; const before = snapshotStatements;
    const response = await route.GET(request(actor), { params: Promise.resolve({ id: classId }) });
    check(response.status, expected, name + ': actual route outcome'); check(response.headers.get('cache-control'), 'no-store', 'Sensitive snapshot is uncached');
    check(snapshotStatements - before, actor && expected !== 401 ? 1 : 0, 'Authenticated current reads use one snapshot; rejected sessions never execute the protected class SELECT');
    if (mutation) check(atSnapshot, undefined, 'Late change reached the actual D1 statement');
    const result = await response.json();
    if (expected !== 200) check(result, { error: expected === 401 ? 'Authentication required' : 'Not found' }, 'Unavailable response releases no older record snapshot');
    return result;
  }
  const unlink = type => profileLinks.reviewProfileLink({ id: 'admin-a', role: 'admin', schoolId: 'a' }, {
    profileType: type, profileId: type === 'guardian' ? 'guardian-profile-a' : 'student-a', userId: null,
    expectedVersion: 0, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic concurrent summary ownership unlink.' });
  try { await action({ ...fixture, read, request, principals, cookies, unlink, counts: () => ({ snapshotStatements, allStatements }) }); scenarios++; }
  finally { globalThis.__sahaTestDb = db; sqlite.close(); }
}

try {
  await scenario('Two linked pupils baseline and narrow projections', async ({ read }) => {
    check(await read(null, undefined, 401), { error: 'Authentication required' }, 'No unauthenticated summary');
    for (const [actor, role] of roles) {
      const result = await read(actor); check(result.role, role, 'Snapshot role follows actual session');
      check(Object.keys(result).sort(), ['asOf', 'class', 'pupils', 'role'], 'No provider or account details in summary');
      check(result.pupils.items.map(pupil => pupil.id), role === 'student' ? ['student-a'] : ['student-a', 'student-other'], 'Family access excludes unrelated roster members');
      for (const pupil of result.pupils.items) {
        check(Object.keys(pupil).sort(), ['admissionNumber', 'attendance', 'currentActive', 'firstName', 'id', 'lastName'], 'Pupil projection omits birth date mappings notes and grades');
        check(Object.values(pupil.attendance.counts).reduce((a, b) => a + b, 0), pupil.attendance.recordedRows, 'Every saved status contributes exactly once');
      }
      for (const marker of ['PRIVATE_ATTENDANCE_NOTE', 'identityIssuer', 'identitySubject', '@example.invalid', 'student-b', 'percentage', 'grade', 'feedback']) check(JSON.stringify(result).includes(marker), false, 'No private marker or unapproved derived result in summary');
    }
  });
  for (const [actor, role] of roles) for (const [label, sql] of [
    ['disabled', "UPDATE users SET disabled_at='revoked' WHERE id=?"], ['role changed', 'UPDATE users SET role=? WHERE id=?'],
    ['school changed', "UPDATE users SET school_id='b' WHERE id=?"], ['issuer removed', 'UPDATE users SET identity_issuer=NULL WHERE id=?'],
    ['subject blank', "UPDATE users SET identity_subject='' WHERE id=?"],
  ]) await scenario(role + ' live account ' + label, async ({ sqlite, read }) => {
    await read(actor, () => label === 'role changed' ? sqlite.prepare(sql).run(role === 'student' ? 'teacher' : 'student', actor) : sqlite.prepare(sql).run(actor), 404);
  });
  for (const [label, sql] of [
    ['class moved', "UPDATE classes SET school_id='b' WHERE id='class-a'"],
    ['class reassigned', "UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'"],
  ]) await scenario('Teacher current class ' + label, async ({ sqlite, read }) => read('teacher-a', () => sqlite.exec(sql), 404));
  for (const type of ['student', 'guardian']) await scenario('Reviewed ' + type + ' unlink before actual summary', async ({ read, unlink, sqlite }) => {
    await read(type === 'student' ? 'student-user-a' : 'guardian-a', () => unlink(type), 404);
    check(sqlite.prepare('SELECT count(*) n FROM students').get().n, 3, 'Reviewed unlink preserves all original pupils');
    check(sqlite.prepare('SELECT count(*) n FROM student_guardians').get().n, 4, 'Reviewed unlink does not delete family relationship history');
  });
  for (const [label, sql] of [
    ['one family relationship removed', "DELETE FROM student_guardians WHERE student_id='student-a' AND guardian_id='guardian-profile-a'"],
    ['one pupil transferred', "UPDATE students SET school_id='b' WHERE id='student-a'"],
  ]) await scenario('Partial family scope ' + label, async ({ sqlite, read }) => {
    const result = await read('guardian-a', () => sqlite.exec(sql));
    check(result.pupils.total, 1, 'Remaining active child still grants class access, not old pupil count');
    check(result.pupils.items.map(pupil => pupil.id), ['student-other'], 'Removed child name admission and attendance are absent');
    check(result.pupils.items[0].attendance.counts, { present: 0, absent: 0, late: 0, excused: 1, other: 0 }, 'Remaining child count is from the same current scope');
  });
  await scenario('Confirmed student ownership replacement uses the current profile', async ({ read, sqlite, cookies }) => {
    await read('student-user-a', async () => {
      const actor = { id: 'admin-a', role: 'admin', schoolId: 'a' };
      await profileLinks.reviewProfileLink(actor, { profileType: 'student', profileId: 'student-a', userId: null, expectedVersion: 0, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic explicitly reviewed former profile unlink.' });
      await profileLinks.reviewProfileLink(actor, { profileType: 'student', profileId: 'student-other', userId: 'student-user-a', expectedVersion: 0, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: 'Synthetic explicitly reviewed current profile link.' });
    }, 404);
    await read('student-user-a', undefined, 401);
    cookies['student-user-a'] = (await sessions.createSession('student-user-a')).split(';')[0];
    const result = await read('student-user-a');
    check(result.pupils.items.map(pupil => pupil.id), ['student-other'], 'Cached principal cannot retain former learner name or marks');
    check(result.pupils.items[0].attendance.counts.excused, 1, 'Current explicitly linked learner has its own saved evidence');
    check(sqlite.prepare('SELECT count(*) n FROM profile_link_events').get().n, 2, 'Both actual reviewed ownership decisions remain attributable');
  });
  await scenario('Names counts and calendar coverage change together', async ({ sqlite, read }) => {
    const result = await read('guardian-a', () => sqlite.exec("UPDATE classes SET name='Current synthetic attendance class' WHERE id='class-a'; UPDATE students SET first_name='Current name',admission_number='CURRENT-ADMISSION' WHERE id='student-a'; UPDATE attendance SET status='late',date='2026-02-30' WHERE id='summary-first';"));
    check(result.class.name, 'Current synthetic attendance class', 'Class heading belongs to the new statement snapshot');
    const pupil = result.pupils.items.find(row => row.id === 'student-a');
    check([pupil.firstName, pupil.admissionNumber], ['Current name', 'CURRENT-ADMISSION'], 'Pupil labels belong to the same statement snapshot');
    check(pupil.attendance, { recordedRows: 1, counts: { present: 0, absent: 0, late: 1, excused: 0, other: 0 }, firstDate: null, lastDate: null, invalidDateRows: 1 }, 'Current status and invalid-date coverage agree with the current label');
  });
  await scenario('Former target-class enrolment preserves only existing read entitlement', async ({ sqlite, read, principals }) => {
    sqlite.exec("UPDATE enrolments SET status='withdrawn' WHERE id='student-a-enrolment'");
    let result = await read('guardian-a'); const historic = result.pupils.items.find(row => row.id === 'student-a');
    check(historic.currentActive, false, 'Saved rows are not mislabeled as current enrolment'); check(historic.attendance.recordedRows, 1, 'Other current linked child retains existing class access');
    check((await legacy.listAttendance(principals['guardian-a'], { classId: 'class-a' })).length, result.pupils.items.reduce((sum, pupil) => sum + pupil.attendance.recordedRows, 0), 'Family observed rows match pre-existing attendance scope');
    result = await read('teacher-a'); check(result.pupils.items.map(row => row.id), ['student-other'], 'Teacher loses former pupil without active assigned eligibility');
    sqlite.exec("UPDATE classes SET teacher_id='teacher-a' WHERE id='class-other'; INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES('other-class-active','student-a','class-other','active','synthetic','synthetic','synthetic');");
    result = await read('teacher-a'); check(result.pupils.items.find(row => row.id === 'student-a').currentActive, false, 'Existing teacher scope distinguishes active elsewhere from this target class');
    check((await legacy.listAttendance(principals['teacher-a'], { classId: 'class-a' })).length, result.pupils.items.reduce((sum, pupil) => sum + pupil.attendance.recordedRows, 0), 'Teacher summary preserves actual legacy read scope without broadening it');
  });
  await scenario('Legacy duplicate enrolments never inflate profile or saved-row totals', async ({ sqlite, read }) => {
    const result = await read('admin-a'); check(result.pupils.total, 2, 'Active duplicate pairs still produce two distinct permitted pupils');
    check(result.pupils.items.find(row => row.id === 'student-a').attendance.recordedRows, 1, 'One saved mark does not multiply through legacy duplicate roster joins');
    check(sqlite.prepare("SELECT count(*) n FROM enrolments WHERE student_id='student-a' AND class_id='class-a'").get().n, 3, 'Summary leaves all unresolved legacy enrolment rows untouched');
    assert.throws(() => sqlite.prepare('INSERT INTO enrolments VALUES(?,?,?,?,?,?,?)').run('new-forbidden-duplicate', 'student-a', 'class-a', 'active', stamp, stamp, stamp), /saha_enrolment_pair_conflict/); passed++;
  }, async ({ db, schema }) => db.insert(schema.enrolments).values(['active', 'withdrawn'].map(status => ({ id: 'legacy-summary-' + status, studentId: 'student-a', classId: 'class-a', status, enrolledAt: stamp, createdAt: stamp, updatedAt: stamp }))));
  await scenario('Calendar edge evidence remains raw and original', async ({ sqlite, read }) => {
    const insert = sqlite.prepare('INSERT INTO attendance VALUES(?,?,?,?,?,?,?,?,?)');
    for (const [index, date] of ['1900-02-29', '2000-02-29', '2026-1-01', '2026-12-31', 'not-a-date'].entries()) insert.run('calendar-' + index, 'class-a', 'student-a', date, index % 2 ? 'excused' : 'legacy unknown', 'PRIVATE_CALENDAR_NOTE', 'teacher-a', stamp, stamp);
    const result = await read('student-user-a'); const evidence = result.pupils.items[0].attendance;
    check(evidence.recordedRows, 6, 'All stored legacy and future rows remain observed evidence');
    check(evidence.counts, { present: 1, absent: 0, late: 0, excused: 2, other: 3 }, 'Unknown statuses retained as explicit raw category');
    check([evidence.firstDate, evidence.lastDate, evidence.invalidDateRows], ['2000-02-29', '2026-12-31', 3], 'Century leap calendar and exact date shape determine date range only');
    check(sqlite.prepare('SELECT count(*) n FROM attendance').get().n, 8, 'No calendar or unknown-status evidence rewritten or discarded');
  });
  await scenario('Mixed current and recorded-only cap remains exact', async ({ db, schema, read }) => {
    await db.insert(schema.students).values(Array.from({ length: 101 }, (_, index) => ({ id: 'mixed-summary-' + index, schoolId: 'a', firstName: 'Synthetic boundary', lastName: String(index).padStart(3, '0'), dateOfBirth: '2012-01-01', admissionNumber: 'MIXED-SUMMARY-' + index, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
    await db.insert(schema.enrolments).values(Array.from({ length: 96 }, (_, index) => ({ id: 'mixed-active-' + index, studentId: 'mixed-summary-' + index, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
    await db.insert(schema.attendance).values(Array.from({ length: 5 }, (_, index) => ({ id: 'mixed-historic-' + index, studentId: 'mixed-summary-' + (96 + index), classId: 'class-a', date: '2026-10-01', status: 'excused', recordedBy: 'teacher-a', createdAt: stamp, updatedAt: stamp })));
    const first = await read('admin-a'); check(first.pupils.total, 103, 'Exact distinct union includes both active and authorized recorded-only pupils');
    check(first.pupils.items.length, 100, 'Mixed inventory is bounded'); check(first.pupils.truncated, true, 'Omitted pupils disclosed explicitly');
    const repeated = await read('admin-a'); check(repeated.pupils.items.map(pupil => pupil.id), first.pupils.items.map(pupil => pupil.id), 'Mixed capped order is deterministic');
    check((await read('guardian-a')).pupils.total, 2, 'Large class never broadens explicit family profiles');
  });
  check(networkCalls, 0, 'No external calls');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, networkCalls,
    limits: ['Fresh SQLite and real synthetic sessions/routes through production D1 driver.', 'Public principal omits session evidence; the actual snapshot rejects the session revoked during reviewed ownership replacement, while a fresh same-account session sees only its current profile.', 'No browser rendering, provider activation, deployment or acceptance inferred.'] }));
} finally { globalThis.fetch = oldFetch; }
