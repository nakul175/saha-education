// FR-09 teacher attendance workflow contracts: school-local calendar, correction history,
// scoped class/learner reports and family views. Real routes, opaque sessions and migrated SQLite.
// Synthetic data only; no network, provider or browser is used.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDatabase, seedSecurityData, load, bindings, stamp, root } from '../support/security-db.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const session = await load('lib/education/session.ts');
const calendar = await load('lib/education/attendance-calendar.ts');
const calendarRoute = await load('app/api/attendance/calendar/route.ts');
const editorRoute = await load('app/api/classes/[id]/attendance-editor/route.ts');
const historyRoute = await load('app/api/classes/[id]/attendance-editor/history/route.ts');
const reportRoute = await load('app/api/classes/[id]/attendance-report/route.ts');
const changesRoute = await load('app/api/classes/[id]/attendance-changes/route.ts');
const studentRoute = await load('app/api/students/[id]/attendance/route.ts');
const legacyRoute = await load('app/api/attendance/route.ts');
const legacyService = await load('lib/education/attendance.ts');
const parameters = id => ({ params: Promise.resolve({ id }) });
let passed = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const ok = (value, message) => { assert.ok(value, message); passed++; };
const oldFetch = globalThis.fetch; globalThis.fetch = async () => { networkCalls++; throw new Error('Attendance workflow contracts are offline only.'); };
const addDays = (date, days) => { const value = new Date(date + 'T00:00:00Z'); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

async function scenario(name, action) {
  const fixture = freshDatabase();
  await seedSecurityData(fixture.db, fixture.schema);
  const { db, schema, sqlite } = fixture;
  // Four extra pupils in class-a give each status a learner and keep unrecorded controls.
  await db.insert(schema.students).values(['one', 'two', 'three', 'four'].map(kind => ({ id: 'pupil-' + kind, schoolId: 'a', firstName: 'Pupil', lastName: kind,
    dateOfBirth: '2012-01-01', admissionNumber: 'WF-' + kind, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
  await db.insert(schema.enrolments).values(['one', 'two', 'three', 'four'].map(kind => ({ id: 'enrol-pupil-' + kind, studentId: 'pupil-' + kind, classId: 'class-a',
    status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
  const cookies = {};
  for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'guardian-other', 'student-user-a', 'student-user-other']) cookies[actor] = (await session.createSession(actor)).split(';')[0];
  const request = (actor, path, method = 'GET', data, selectedOrigin = origin) => new Request(origin + path, { method,
    headers: { ...(actor && cookies[actor] ? { cookie: cookies[actor] } : {}), origin: selectedOrigin, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) });
  const status = (response, expected, message) => { check(response.status, expected, message); check(response.headers.get('cache-control'), 'no-store', message + ': no-store'); return response; };
  const json = async (response, expected, message) => { status(response, expected, message); return response.json(); };
  const api = {
    editor: (actor, date, classId = 'class-a') => editorRoute.GET(request(actor, `/api/classes/${classId}/attendance-editor?date=${date}`), parameters(classId)),
    review: (actor, data, classId = 'class-a') => editorRoute.POST(request(actor, `/api/classes/${classId}/attendance-editor`, 'POST', data), parameters(classId)),
    history: (actor, date, classId = 'class-a') => historyRoute.GET(request(actor, `/api/classes/${classId}/attendance-editor/history?date=${date}`), parameters(classId)),
    changes: (actor, date, classId = 'class-a', extra = '') => changesRoute.GET(request(actor, `/api/classes/${classId}/attendance-changes?date=${date}${extra}`), parameters(classId)),
    report: (actor, query = '', classId = 'class-a') => reportRoute.GET(request(actor, `/api/classes/${classId}/attendance-report${query}`), parameters(classId)),
    student: (actor, studentId, query = '') => studentRoute.GET(request(actor, `/api/students/${studentId}/attendance${query}`), parameters(studentId)),
    calendar: actor => calendarRoute.GET(request(actor, '/api/attendance/calendar')),
    setCalendar: (actor, data, selectedOrigin = origin) => calendarRoute.PUT(request(actor, '/api/attendance/calendar', 'PUT', data, selectedOrigin)),
    legacy: (actor, data) => legacyRoute.POST(request(actor, '/api/attendance', 'POST', data)),
  };
  const reason = 'Synthetic attendance workflow review.';
  const packet = (date, entries, requestReason = reason) => ({ date, clientRequestId: crypto.randomUUID(), reviewConfirmed: true, reason: requestReason, entries });
  // Marks every roster row whose id appears in `marks`, binding the exact loaded record as the expectation.
  async function marks(actor, date, marksById, requestReason, classId = 'class-a') {
    const snapshot = await (await api.editor(actor, date, classId)).json();
    const entries = snapshot.roster.items.filter(row => marksById[row.student.id]).map(row => {
      const wanted = marksById[row.student.id];
      return { studentId: row.student.id, status: wanted.status, note: wanted.note === undefined ? row.record?.note ?? null : wanted.note, expectedRecord: row.record };
    });
    return packet(date, entries, requestReason);
  }
  const count = table => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get().n;
  try { await action({ ...fixture, ...api, request, status, json, packet, marks, count, cookies }); scenarios++; }
  finally { sqlite.close(); }
}

try {
  // ------------------------------------------------------------------ explicit school-local date
  const instants = [
    ['2026-10-05T22:30:00Z', 'Africa/Kigali', '2026-10-06', 'UTC+2 crosses midnight before UTC does'],
    ['2026-10-05T22:30:00Z', 'UTC', '2026-10-05', 'UTC keeps the previous day'],
    ['2026-10-05T10:00:00Z', 'Pacific/Kiritimati', '2026-10-06', 'UTC+14 is a calendar day ahead'],
    ['2026-10-06T05:00:00Z', 'Pacific/Pago_Pago', '2026-10-05', 'UTC-11 is a calendar day behind'],
    ['2026-10-05T18:29:59Z', 'Asia/Kolkata', '2026-10-05', 'Half-hour offset is exclusive just before local midnight'],
    ['2026-10-05T18:30:00Z', 'Asia/Kolkata', '2026-10-06', 'Half-hour offset flips at exactly local midnight'],
    ['2026-11-01T03:59:59Z', 'America/New_York', '2026-10-31', 'Just before local midnight (EDT) the date is still the previous day'],
    ['2026-11-01T04:00:00Z', 'America/New_York', '2026-11-01', 'Local midnight (EDT) starts 1 November'],
    ['2026-11-02T04:59:59Z', 'America/New_York', '2026-11-01', 'The 25-hour DST-end day lasts until 04:59:59Z'],
    ['2026-11-02T05:00:00Z', 'America/New_York', '2026-11-02', 'Local midnight (EST) after the 25-hour day'],
    ['2028-02-29T23:59:59Z', 'UTC', '2028-02-29', 'Leap day in UTC'],
    ['2028-02-29T23:59:59Z', 'Africa/Kigali', '2028-03-01', 'Leap day ends earlier in UTC+2'],
    ['2026-12-31T22:00:00Z', 'Africa/Kigali', '2027-01-01', 'Year rolls over by local calendar'],
  ];
  for (const [instant, zone, expected, why] of instants) check(calendar.schoolLocalDate(new Date(instant), zone), expected, `${zone} ${instant}: ${why}`);
  check(calendar.canonicalTimeZone('africa/kigali'), 'Africa/Kigali', 'Zone names are canonicalised, not stored as typed');
  for (const bad of ['', 'Not/AZone', 'Africa/Kigali; drop table x', 'x'.repeat(65), ' Africa/Kigali', 'UTC+99', 'Africa Kigali', "o'clock"]) check(calendar.canonicalTimeZone(bad), null, `Unknown or unsafe zone rejected: ${JSON.stringify(bad)}`);
  assert.throws(() => calendar.schoolLocalDate(new Date('invalid'), 'UTC'), RangeError); passed++;
  assert.throws(() => calendar.schoolLocalDate(new Date(), 'Not/AZone'), RangeError); passed++;
  check(calendar.DEFAULT_ATTENDANCE_TIMEZONE, 'UTC', 'Unconfigured schools keep the established UTC calendar');

  await scenario('Calendar defaults, administrator-only change and school isolation', async ({ calendar: read, setCalendar, status, json, sqlite }) => {
    for (const actor of ['admin-a', 'teacher-a', 'guardian-a', 'student-user-a']) {
      const value = await json(await read(actor), 200, 'Every current school member can read the calendar');
      check({ timezone: value.timezone, configured: value.configured, futureDatesAllowed: value.futureDatesAllowed, updatedAt: value.updatedAt }, { timezone: 'UTC', configured: false, futureDatesAllowed: true, updatedAt: null }, 'Unconfigured defaults are explicit');
      check(value.schoolDate, calendar.schoolLocalDate(new Date(value.asOf), 'UTC'), 'School date is derived from the zone at the server read instant');
      check(Object.keys(value).sort(), ['asOf', 'configured', 'futureDatesAllowed', 'schoolDate', 'timezone', 'updatedAt'], 'Only calendar facts are disclosed');
    }
    status(await read(null), 401, 'Anonymous calendar read denied');
    for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) status(await setCalendar(actor, '{'), 403, 'Role checked before body parsing: ' + actor);
    status(await setCalendar('admin-a', '{'), 400, 'Malformed JSON');
    status(await setCalendar('admin-a', { timezone: 'Africa/Kigali', futureDatesAllowed: false }, 'https://foreign.example.invalid'), 403, 'Foreign origin denied');
    for (const body of [{ timezone: 'Not/AZone', futureDatesAllowed: true }, { timezone: 'Africa/Kigali' }, { timezone: 'Africa/Kigali', futureDatesAllowed: 'no' },
      { timezone: 'Africa/Kigali', futureDatesAllowed: true, schoolId: 'b' }, { timezone: '', futureDatesAllowed: true }]) status(await setCalendar('admin-a', body), 400, 'Invalid calendar packet ' + JSON.stringify(body));
    check(sqlite.prepare('SELECT count(*) n FROM school_attendance_settings').get().n, 0, 'Rejected requests persist nothing');
    const saved = await json(await setCalendar('admin-a', { timezone: 'africa/kigali', futureDatesAllowed: false }), 200, 'Administrator saves calendar');
    check({ timezone: saved.timezone, configured: saved.configured, futureDatesAllowed: saved.futureDatesAllowed }, { timezone: 'Africa/Kigali', configured: true, futureDatesAllowed: false }, 'Canonical zone and policy returned');
    check(saved.schoolDate, calendar.schoolLocalDate(new Date(saved.asOf), 'Africa/Kigali'), 'School date now follows the school zone');
    check(sqlite.prepare('SELECT school_id,timezone,future_dates_allowed,updated_by FROM school_attendance_settings').all().map(row => ({ ...row })),
      [{ school_id: 'a', timezone: 'Africa/Kigali', future_dates_allowed: 0, updated_by: 'admin-a' }], 'Server attributes the setting to the current administrator and school');
    check((await (await read('teacher-a')).json()).timezone, 'Africa/Kigali', 'Teachers read the school zone');
    check((await (await read('admin-b')).json()).configured, false, 'Another school is unchanged');
    await json(await setCalendar('admin-a', { timezone: 'Asia/Kolkata', futureDatesAllowed: true }), 200, 'Second save updates in place');
    check(sqlite.prepare('SELECT count(*) n FROM school_attendance_settings').get().n, 1, 'One setting row per school');
    status(await setCalendar('admin-b', { timezone: 'Pacific/Auckland', futureDatesAllowed: true }), 200, 'Other school administrator manages only its own school');
    check(sqlite.prepare('SELECT school_id,timezone FROM school_attendance_settings ORDER BY school_id').all().map(row => ({ ...row })), [{ school_id: 'a', timezone: 'Asia/Kolkata' }, { school_id: 'b', timezone: 'Pacific/Auckland' }], 'Schools keep independent calendars');
    sqlite.prepare("UPDATE users SET disabled_at=? WHERE id='admin-a'").run(stamp);
    status(await setCalendar('admin-a', { timezone: 'UTC', futureDatesAllowed: true }), 401, 'A disabled administrator cannot change the calendar');
    check(sqlite.prepare("SELECT timezone FROM school_attendance_settings WHERE school_id='a'").get().timezone, 'Asia/Kolkata', 'Denied change leaves setting intact');
    assert.throws(() => sqlite.prepare("INSERT INTO school_attendance_settings VALUES ('b','x y',1,'admin-b',?)").run(stamp)); passed++;
    assert.throws(() => sqlite.prepare("UPDATE school_attendance_settings SET future_dates_allowed=2 WHERE school_id='a'").run()); passed++;
  });

  await scenario('Future-date policy follows the school calendar date and never blocks an exact replay', async ({ calendar: read, setCalendar, review, packet, marks, status, json, count }) => {
    status(await setCalendar('admin-a', { timezone: 'Pacific/Kiritimati', futureDatesAllowed: false }), 200, 'School selects UTC+14 and no future dates');
    const today = (await (await read('teacher-a')).json()).schoolDate;
    check(today, calendar.schoolLocalDate(new Date(), 'Pacific/Kiritimati'), 'Server school date equals independent zone calculation');
    const tomorrow = addDays(today, 1), yesterday = addDays(today, -1);
    let denied = await review('teacher-a', await marks('teacher-a', tomorrow, { 'student-a': { status: 'present' } }));
    status(denied, 400, 'A date after the school calendar date is rejected'); check(count('attendance') + count('attendance_reviews'), 0, 'Rejected future date persists nothing');
    for (const date of [today, yesterday]) status(await review('teacher-a', await marks('teacher-a', date, { 'student-a': { status: 'present' } })), 201, 'School today and past dates are accepted: ' + date);
    // Policy off and then on again: an old committed future review replays, a new one does not.
    status(await setCalendar('admin-a', { timezone: 'Pacific/Kiritimati', futureDatesAllowed: true }), 200, 'Policy temporarily allows future dates');
    const future = await marks('teacher-a', tomorrow, { 'pupil-one': { status: 'excused', note: 'Planned absence' } });
    const first = await json(await review('teacher-a', future), 201, 'Future review accepted while allowed');
    status(await setCalendar('admin-a', { timezone: 'Pacific/Kiritimati', futureDatesAllowed: false }), 200, 'Policy forbids future dates again');
    const replay = await json(await review('teacher-a', future), 200, 'Exact committed UUID still replays after the policy change');
    check(replay, { review: first.review, replayed: true }, 'Replay returns the original receipt');
    status(await review('teacher-a', await marks('teacher-a', tomorrow, { 'pupil-two': { status: 'absent' } })), 400, 'A new future review is rejected under the stricter policy');
    check(count('attendance_reviews'), 3, 'Only the three accepted reviews exist');
    // The same instant is a different school date in a different zone, so the same date can be valid there.
    status(await setCalendar('admin-a', { timezone: 'Pacific/Pago_Pago', futureDatesAllowed: false }), 200, 'School moves to UTC-11');
    const behind = (await (await read('teacher-a')).json()).schoolDate;
    check(behind <= today, true, 'UTC-11 date is never ahead of UTC+14 date at one instant');
    status(await review('teacher-a', await marks('teacher-a', addDays(behind, 1), { 'pupil-three': { status: 'late' } })), 400, 'Boundary is recomputed from the school zone');
    check(packet('2026-10-05', []).entries, [], 'Helper sanity');
  });

  // ------------------------------------------------------------------ teacher workflow
  await scenario('Roll call, correction with reason, exact retry and history', async ({ editor, review, history, changes, marks, status, json, count, sqlite }) => {
    const date = '2026-10-05';
    const blank = await json(await editor('teacher-a', date), 200, 'Session opens for the class and date');
    check(blank.roster.items.map(row => row.student.id), ['pupil-four', 'pupil-one', 'pupil-three', 'pupil-two', 'student-a'], 'Active roster in name order');
    check(blank.roster.items.every(row => row.record === null), true, 'Nobody is pre-marked present');
    const roll = await marks('teacher-a', date, { 'student-a': { status: 'present' }, 'pupil-one': { status: 'absent', note: 'Sick' }, 'pupil-two': { status: 'late' }, 'pupil-three': { status: 'excused', note: 'Clinic' } }, 'Initial roll call for 2026-10-05');
    const created = await json(await review('teacher-a', roll), 201, 'Initial roll call saves with a receipt');
    check(created.replayed, false, 'Fresh save is not a replay'); check(created.review.reason, 'Initial roll call for 2026-10-05', 'Reason is part of the receipt');
    check(created.review.changes.map(change => [change.studentId, change.beforeRecord, change.afterRecord.status]), [['pupil-one', null, 'absent'], ['pupil-three', null, 'excused'], ['pupil-two', null, 'late'], ['student-a', null, 'present']], 'Every first mark has no invented before record');
    check(count('attendance'), 4, 'Unmarked learner stays unrecorded'); check(count('attendance_changes'), 0, 'First marks replace nothing, so the change log is empty');
    // Exact retry with the original UUID after a lost reply.
    const retried = await json(await review('teacher-a', roll), 200, 'Exact retry returns the original receipt'); check(retried, { review: created.review, replayed: true }, 'Retry is byte-equal evidence');
    check(count('attendance_reviews'), 1, 'Retry creates no second receipt');
    // Correction: absent -> present with reason; excused note cleared.
    const loaded = await (await editor('teacher-a', date)).json();
    const before = loaded.roster.items.find(row => row.student.id === 'pupil-one').record;
    const fix = await marks('teacher-a', date, { 'pupil-one': { status: 'present', note: 'Arrived after roll call' } }, 'Corrected: pupil arrived after the register closed.');
    const corrected = await json(await review('teacher-a', fix), 201, 'Correction with reason saves'); const change = corrected.review.changes[0];
    check(change.beforeRecord, before, 'Receipt keeps the full original record'); check([change.afterRecord.status, change.afterRecord.note], ['present', 'Arrived after roll call'], 'Receipt keeps the new mark');
    check(change.afterRecord.id, before.id, 'Correction keeps the record identity'); check(change.afterRecord.createdAt, before.createdAt, 'Correction keeps the original creation time');
    ok(change.afterRecord.updatedAt > before.updatedAt || change.afterRecord.updatedAt === before.updatedAt, 'Update time is server-derived');
    const log = await json(await changes('teacher-a', date), 200, 'Change log readable by assigned teacher');
    check(log.total, 1, 'The correction produced one change-log row'); check(log.items[0].reviewed, true, 'The row is linked to a reviewed receipt');
    check([log.items[0].studentName, log.items[0].kind, log.items[0].beforeRecord.status, log.items[0].afterRecord.status], ['Pupil one', 'update', 'absent', 'present'], 'Log shows learner, kind and before/after');
    check(log.actors.map(actor => actor.id), ['teacher-a'], 'Actors resolve ids to display names for the page'); check(log.actors[0].name, 'teacher-a', 'Name comes from the school user record');
    check(Object.hasOwn(log.items[0], 'requestHash'), false, 'No private fingerprint');
    const trail = await json(await history('teacher-a', date), 200, 'Review history'); check(trail.items.map(item => item.reason), ['Corrected: pupil arrived after the register closed.', 'Initial roll call for 2026-10-05'], 'Newest review first, both reasons preserved');
    // A no-op or reason-less correction is refused with nothing written.
    status(await review('teacher-a', { ...fix, clientRequestId: crypto.randomUUID(), entries: [{ ...fix.entries[0], status: 'present', note: 'Arrived after roll call', expectedRecord: (await (await editor('teacher-a', date)).json()).roster.items.find(row => row.student.id === 'pupil-one').record }] }), 400, 'No-op correction is refused');
    status(await review('teacher-a', { ...(await marks('teacher-a', date, { 'pupil-one': { status: 'late' } })), reason: 'short' }), 400, 'Correction without a real reason is refused');
    check(count('attendance_reviews'), 2, 'Refusals created no receipts'); check(count('attendance_changes'), 1, 'Refusals created no log rows');
    // Immutability of both evidence stores.
    for (const statement of ["UPDATE attendance_changes SET change_kind='delete'", 'DELETE FROM attendance_changes', "UPDATE attendance_reviews SET reason='tampered tampered'", 'DELETE FROM attendance_review_entries']) {
      assert.throws(() => sqlite.exec(statement), /immutable/i); passed++;
    }
    // Replay after the mark changed again must not reapply the old values.
    await json(await review('teacher-a', await marks('teacher-a', date, { 'pupil-one': { status: 'late', note: null } }, 'Second correction after parent call.')), 201, 'Later correction');
    const again = await json(await review('teacher-a', fix), 200, 'Original correction UUID still replays'); check(again.replayed, true, 'Replay flagged');
    check(sqlite.prepare("SELECT status FROM attendance WHERE student_id='pupil-one'").get().status, 'late', 'Replay never reapplies the older mark');
    check(count('attendance_changes'), 2, 'Chain of two corrections is fully logged');
  });

  await scenario('Another teacher changed the mark: conflict, reload and re-review', async ({ editor, review, history, changes, marks, status, json, count, sqlite }) => {
    const date = '2026-10-05';
    await json(await review('teacher-a', await marks('teacher-a', date, { 'student-a': { status: 'absent' } }, 'Initial roll call for 2026-10-05')), 201, 'Initial mark');
    // Two staff open the same record, then the administrator saves first.
    const teacherView = await marks('teacher-a', date, { 'student-a': { status: 'late', note: 'Teacher saw learner at 9:10' } }, 'Learner arrived late and was marked absent.');
    const adminView = await marks('admin-a', date, { 'student-a': { status: 'excused', note: 'Parent called' } }, 'Parent confirmed an excused absence.');
    await json(await review('admin-a', adminView), 201, 'First writer wins');
    status(await review('teacher-a', teacherView), 409, 'Stale expectation is a conflict, never a silent overwrite');
    check({ ...sqlite.prepare("SELECT status,note,recorded_by FROM attendance WHERE student_id='student-a'").get() }, { status: 'excused', note: 'Parent called', recorded_by: 'admin-a' }, 'The first writer is untouched');
    check(count('attendance_reviews'), 2, 'Conflict wrote no receipt');
    // The retained intent is rebuilt against the reloaded evidence and then saved.
    const reloaded = await (await editor('teacher-a', date)).json(); check(reloaded.roster.items.find(row => row.student.id === 'student-a').record.status, 'excused', 'Reload shows the other teacher change');
    await json(await review('teacher-a', await marks('teacher-a', date, { 'student-a': { status: 'late', note: 'Teacher saw learner at 9:10' } }, 'Learner arrived at 9:10 after the parent call.')), 201, 'Re-reviewed correction saves');
    const trail = await (await history('teacher-a', date)).json(); check(trail.items.map(item => item.reviewedBy), ['teacher-a', 'admin-a', 'teacher-a'], 'History records each decision and who made it');
    const log = await (await changes('admin-a', date)).json(); check(log.items.map(item => [item.beforeRecord.status, item.afterRecord.status, item.reviewed]), [['excused', 'late', true], ['absent', 'excused', true]], 'Change log chains each overwrite');
    check(log.actors.map(actor => actor.id).sort(), ['admin-a', 'teacher-a'], 'Both recorders resolve to names');
  });

  await scenario('Overwrites that bypass review are still recorded, never silent', async ({ review, legacy, changes, marks, json, count, sqlite }) => {
    const date = '2026-10-05';
    await json(await review('teacher-a', await marks('teacher-a', date, { 'student-a': { status: 'present', note: 'Original note' } }, 'Initial roll call for 2026-10-05')), 201, 'Reviewed first mark');
    check((await legacy('teacher-a', { classId: 'class-a', date, entries: [{ studentId: 'student-a', status: 'absent' }] })).status, 200, 'The established replacement API keeps its behaviour');
    const log = await json(await changes('teacher-a', date), 200, 'Log lists the bypassing change');
    check(log.items.map(item => [item.kind, item.beforeRecord.status, item.beforeRecord.note, item.afterRecord.status, item.afterRecord.note, item.reviewed]), [['update', 'present', 'Original note', 'absent', null, false]], 'Replacement and its cleared note are visible and flagged as not reviewed');
    check(count('attendance_reviews'), 1, 'No fabricated review receipt exists for the replacement');
    check(sqlite.prepare("SELECT recorded_by FROM attendance WHERE student_id='student-a'").get().recorded_by, 'teacher-a', 'Attribution stays server-derived');
    // A same-status replacement changes nothing and logs nothing.
    check((await legacy('teacher-a', { classId: 'class-a', date, entries: [{ studentId: 'student-a', status: 'absent' }] })).status, 200, 'Identical replacement');
    check(count('attendance_changes'), 1, 'No-op replacement is not logged as a change');
    // A row that a review references cannot be deleted at all (foreign key), so deletion applies only to legacy-only rows.
    assert.throws(() => sqlite.prepare("DELETE FROM attendance WHERE student_id='student-a'").run(), /FOREIGN KEY/); passed++;
    check((await legacy('teacher-a', { classId: 'class-a', date, entries: [{ studentId: 'pupil-two', status: 'late', note: 'Legacy only' }] })).status, 200, 'Legacy-only mark');
    sqlite.prepare("DELETE FROM attendance WHERE student_id='pupil-two'").run();
    const afterDelete = await (await changes('teacher-a', date)).json();
    check(afterDelete.items.map(item => [item.studentId, item.kind, item.afterRecord, item.beforeRecord.note, item.reviewed]), [['pupil-two', 'delete', null, 'Legacy only', false], ['student-a', 'update', afterDelete.items[1].afterRecord, 'Original note', false]], 'Deleting a mark is preserved in the log too');
    const filtered = await (await changes('teacher-a', date, 'class-a', '&studentId=pupil-one')).json(); check(filtered.total, 0, 'Learner filter narrows exactly');
  });

  await scenario('Only the currently assigned teacher can mark, read reports or see evidence', async ({ editor, review, history, changes, report, marks, status, json, count, sqlite }) => {
    const date = '2026-10-05';
    const mine = await marks('teacher-a', date, { 'student-a': { status: 'present' } });
    status(await review('teacher-other', mine), 404, 'An unassigned teacher cannot mark this class');
    status(await review('admin-b', mine), 404, 'Another school administrator cannot mark this class');
    for (const [actor, expected] of [['teacher-other', 404], ['admin-b', 404], ['teacher-b', 404], ['guardian-a', 403], ['student-user-a', 403]]) {
      status(await editor(actor, date), expected, `Editor read denied for ${actor}`); status(await history(actor, date), expected, `History denied for ${actor}`);
      status(await changes(actor, date), expected, `Change log denied for ${actor}`); status(await report(actor), expected, `Class report denied for ${actor}`);
    }
    check(count('attendance') + count('attendance_reviews'), 0, 'Denied requests wrote nothing');
    await json(await review('teacher-a', mine), 201, 'The assigned teacher can mark');
    // Reassignment takes effect immediately for every route, with no stale access.
    sqlite.prepare("UPDATE classes SET teacher_id='teacher-other' WHERE id='class-a'").run();
    const stale = await marks('teacher-other', date, { 'student-a': { status: 'late' } }, 'Taking over this class after reassignment.');
    status(await review('teacher-a', { ...stale, clientRequestId: crypto.randomUUID() }), 404, 'The former teacher is blocked at once');
    for (const read of [editor, history, changes]) status(await read('teacher-a', date), 404, 'Former teacher reads are blocked');
    status(await report('teacher-a'), 404, 'Former teacher report is blocked');
    await json(await review('teacher-other', stale), 201, 'The new teacher can correct it');
    status(await editor('admin-a', date), 200, 'A school administrator keeps access');
  });

  // ------------------------------------------------------------------ class and learner reports
  const seedReportRows = (sqlite) => {
    const insert = sqlite.prepare("INSERT INTO attendance (id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)");
    const rows = [
      ['2026-09-28', 'student-a', 'present'], ['2026-09-28', 'pupil-one', 'absent'], ['2026-09-28', 'pupil-two', 'late'], ['2026-09-28', 'pupil-three', 'excused'],
      ['2026-09-29', 'student-a', 'present'], ['2026-09-29', 'pupil-one', 'present'],
      ['2026-10-01', 'student-a', 'absent'], ['2026-10-01', 'pupil-two', 'late'], ['2026-10-01', 'pupil-four', 'legacy-unknown'],
      ['2026-10-05', 'student-a', 'present'],
    ];
    rows.forEach(([date, studentId, status], index) => insert.run('report-' + index, 'class-a', studentId, date, status, studentId === 'student-a' ? 'PRIVATE staff note ' + date : null, 'teacher-a', stamp, stamp));
    insert.run('report-invalid', 'class-a', 'student-a', '2026-02-30', 'present', null, 'teacher-a', stamp, stamp);
    insert.run('report-other-class', 'class-other', 'student-other', '2026-09-28', 'absent', null, 'teacher-other', stamp, stamp);
  };
  await scenario('Class report: per-date counts, range, unmarked learners and disclosure', async ({ report, status, json, sqlite }) => {
    seedReportRows(sqlite);
    sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE student_id='pupil-three'").run();
    const all = await json(await report('teacher-a'), 200, 'Assigned teacher reads the report');
    check(all.class, { id: 'class-a', name: 'class-a' }, 'Class identified'); check(all.range, { from: null, to: null }, 'Unbounded range is explicit');
    check(all.rosterActive, 4, 'Active roster excludes the withdrawn learner'); check(all.invalidDateRows, 1, 'Non-calendar date rows are disclosed, not silently dropped');
    check(all.totals, { recordedRows: 10, present: 4, absent: 2, late: 2, excused: 1, other: 1 }, 'Totals count each valid row once; unrecognised status is visible as other');
    check(all.days.items.map(day => [day.date, day.recordedRows, day.present, day.absent, day.late, day.excused, day.other, day.unmarkedCurrentPupils]),
      [['2026-10-05', 1, 1, 0, 0, 0, 0, 3], ['2026-10-01', 3, 0, 1, 1, 0, 1, 1], ['2026-09-29', 2, 2, 0, 0, 0, 0, 2], ['2026-09-28', 4, 1, 1, 1, 1, 0, 1]],
      'Per-date breakdown lists only dates with saved rows and counts current pupils with no mark that day');
    check(all.pupils.items.map(pupil => [pupil.firstName + ' ' + pupil.lastName, pupil.currentActive, pupil.recordedRows]), [['Pupil four', true, 1], ['Pupil one', true, 2], ['Pupil three', false, 1], ['Pupil two', true, 2], ['student-a Synthetic', true, 4]],
      'Learners with saved rows stay visible after withdrawal and are flagged');
    check(all.pupils.total, 5, 'Exact learner total'); check(all.pupils.truncated, false, 'Not truncated');
    for (const key of ['note', 'notes', 'recordedBy', 'percentage', 'rate']) check(JSON.stringify(all).includes('"' + key + '"'), false, 'Report never exposes ' + key);
    ok(!JSON.stringify(all).includes('PRIVATE staff note'), 'Staff notes are not in the aggregate report');
    const window = await json(await report('admin-a', '?from=2026-09-29&to=2026-10-01'), 200, 'Inclusive range');
    check(window.range, { from: '2026-09-29', to: '2026-10-01' }, 'Range echoed exactly');
    check(window.totals, { recordedRows: 5, present: 2, absent: 1, late: 1, excused: 0, other: 1 }, 'Both boundary dates are included, outside dates are not');
    check(window.days.items.map(day => day.date), ['2026-10-01', '2026-09-29'], 'Only in-range dates listed'); check(window.invalidDateRows, 1, 'Invalid rows remain disclosed under a range');
    check((await (await report('teacher-a', '?from=2026-10-02')).json()).totals.recordedRows, 1, 'Open-ended start');
    check((await (await report('teacher-a', '?to=2026-09-28')).json()).totals.recordedRows, 4, 'Open-ended end');
    check((await (await report('teacher-a', '?from=2027-01-01&to=2027-01-31')).json()).days, { items: [], total: 0, limit: 100, truncated: false }, 'Empty range is an honest empty result');
    for (const query of ['?from=2026-10-05&to=2026-09-28', '?from=2026-02-30', '?to=nope', '?from=2026-10-5', '?from=2026-10-05T00:00:00Z']) status(await report('teacher-a', query), 400, 'Invalid range rejected ' + query);
    status(await report('teacher-a', '', 'missing-class'), 404, 'Unknown class hides existence');
  });

  await scenario('Class report bounds and exact totals', async ({ report, json, sqlite, db, schema }) => {
    const ids = Array.from({ length: 105 }, (_, index) => 'bulk-' + String(index).padStart(3, '0'));
    await db.insert(schema.students).values(ids.map(id => ({ id, schoolId: 'a', firstName: 'Bulk', lastName: id, dateOfBirth: '2012-01-01', admissionNumber: id, gradeLevel: '8', createdAt: stamp, updatedAt: stamp })));
    await db.insert(schema.enrolments).values(ids.map(id => ({ id: 'e-' + id, studentId: id, classId: 'class-a', status: 'active', enrolledAt: stamp, createdAt: stamp, updatedAt: stamp })));
    const insert = sqlite.prepare("INSERT INTO attendance (id,class_id,student_id,date,status,recorded_by,created_at,updated_at) VALUES (?,?,?,?,?,'teacher-a',?,?)");
    for (let day = 0; day < 105; day++) insert.run('d-' + day, 'class-a', 'bulk-000', addDays('2026-01-01', day), 'present', stamp, stamp);
    const value = await json(await report('teacher-a'), 200, 'Large class report');
    check([value.pupils.total, value.pupils.items.length, value.pupils.truncated, value.pupils.limit], [110, 100, true, 100], 'Pupil list is capped with exact total');
    check([value.days.total, value.days.items.length, value.days.truncated, value.days.limit], [105, 100, true, 100], 'Day list is capped with exact total');
    check(value.days.items[0].date, addDays('2026-01-01', 104), 'Newest dates are kept'); check(value.totals.recordedRows, 105, 'Totals cover every row, not only displayed ones');
  });

  await scenario('Learner view is scoped to the learner, linked family and current staff', async ({ student, status, json, sqlite }) => {
    seedReportRows(sqlite);
    sqlite.prepare("INSERT INTO attendance (id,class_id,student_id,date,status,note,recorded_by,created_at,updated_at) VALUES ('sa-other-class','class-other','student-a','2026-09-30','absent','OTHER CLASS PRIVATE','teacher-other',?,?)").run(stamp, stamp);
    sqlite.prepare("INSERT INTO enrolments (id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('sa-second','student-a','class-other','active',?,?,?)").run(stamp, stamp, stamp);
    // own-record roles
    const own = await json(await student('student-user-a', 'student-a'), 200, 'A learner reads their own record');
    check(own.student, { id: 'student-a', firstName: 'student-a', lastName: 'Synthetic', admissionNumber: 'student-a' }, 'Minimal learner identity');
    check(own.totals, { recordedRows: 6, present: 4, absent: 2, late: 0, excused: 0, other: 0 }, 'Own totals count every row across the learner current classes, including the invalid-date row');
    check(own.invalidDateRows, 1, 'Invalid-date row disclosed and counted'); check(own.records.items.map(item => [item.date, item.className, item.status]), [['2026-10-05', 'class-a', 'present'], ['2026-10-01', 'class-a', 'absent'], ['2026-09-30', 'class-other', 'absent'], ['2026-09-29', 'class-a', 'present'], ['2026-09-28', 'class-a', 'present'], ['2026-02-30', 'class-a', 'present']], 'Day-by-day list, newest first, with class names rather than ids; the invalid stored date is kept and flagged');
    check(own.records.items.map(item => item.dateValid), [true, true, true, true, true, false], 'Invalid stored dates are flagged, never repaired');
    ok(own.records.items.every(item => item.note === null && item.recordedByName === null), 'Learner and family never see teacher notes or recorder names');
    ok(!JSON.stringify(own).includes('PRIVATE'), 'Private note text does not appear anywhere in the family payload');
    check(own.classes.map(item => [item.name, item.recordedRows]), [['class-a', 5], ['class-other', 1]], 'Per-class totals');
    check((await (await student('guardian-a', 'student-a')).json()).records, own.records, 'A linked guardian sees the same family view');
    for (const [actor, expected] of [['guardian-other', 404], ['student-user-other', 404], ['admin-b', 404], ['teacher-b', 404]]) status(await student(actor, 'student-a'), expected, `Unrelated ${actor} cannot read this learner`);
    status(await student(null, 'student-a'), 401, 'Anonymous denied'); status(await student('guardian-a', 'student-other'), 404, 'A guardian cannot read another family learner');
    status(await student('guardian-a', 'missing'), 404, 'Unknown learner hides existence');
    // staff scope is the intersection of learner and class authority
    const asTeacher = await json(await student('teacher-a', 'student-a'), 200, 'The assigned teacher reads the learner');
    check(asTeacher.records.items.map(item => item.className), ['class-a', 'class-a', 'class-a', 'class-a', 'class-a'], 'The teacher sees only rows from their own class');
    ok(asTeacher.records.items.some(item => item.note === 'PRIVATE staff note 2026-10-05') && asTeacher.records.items.every(item => !String(item.note).includes('OTHER CLASS')), 'Staff see notes, but never another class notes');
    check(asTeacher.records.items[0].recordedByName, 'teacher-a', 'Staff see a recorder name, not an account id');
    const otherTeacher = await json(await student('teacher-other', 'student-a'), 200, 'The other class teacher also teaches this learner'); check(otherTeacher.records.items.map(item => item.id), ['sa-other-class'], 'They see only their own class rows');
    check((await (await student('admin-a', 'student-a')).json()).totals.recordedRows, 6, 'The administrator sees all school rows');
    // parity with the long-standing scoped list, for every role
    for (const actor of ['admin-a', 'teacher-a', 'teacher-other', 'guardian-a', 'student-user-a']) {
      const principal = await session.principalForToken(await tokenFor(actor));
      const legacyIds = (await legacyService.listAttendance(principal, { studentId: 'student-a' })).map(row => row.id).sort();
      const mine = (await (await student(actor, 'student-a')).json()).records.items.map(item => item.id).sort();
      check(mine, legacyIds, `Rows visible to ${actor} equal the existing scoped attendance list`);
    }
    // withdrawn class disappears for family exactly as the existing list does
    sqlite.prepare("UPDATE enrolments SET status='withdrawn' WHERE id='sa-second'").run();
    check((await (await student('guardian-a', 'student-a')).json()).records.items.map(item => item.className).includes('class-other'), false, 'A class the learner no longer attends leaves the family view');
    // range
    const window = await (await student('guardian-a', 'student-a', '?from=2026-09-29&to=2026-10-01')).json();
    check(window.totals, { recordedRows: 2, present: 1, absent: 1, late: 0, excused: 0, other: 0 }, 'Range totals'); check(window.range, { from: '2026-09-29', to: '2026-10-01' }, 'Range echoed');
    status(await student('guardian-a', 'student-a', '?from=2026-10-05&to=2026-09-01'), 400, 'Reversed range rejected');
    // limits
    const insert = sqlite.prepare("INSERT INTO attendance (id,class_id,student_id,date,status,recorded_by,created_at,updated_at) VALUES (?,'class-a','student-a',?,'present','teacher-a',?,?)");
    for (let day = 0; day < 210; day++) insert.run('many-' + day, addDays('2025-01-01', day), stamp, stamp);
    const long = await (await student('guardian-a', 'student-a')).json(); check([long.records.items.length, long.records.total, long.records.truncated, long.records.limit], [200, 215, true, 200], 'Record list is bounded with an exact total');
    check(long.totals.recordedRows, 215, 'Totals include omitted rows');
    check(Object.hasOwn(long, 'percentage') || Object.hasOwn(long.totals, 'percentage'), false, 'No percentage is invented');
    async function tokenFor(actor) { const value = (await session.createSession(actor)).split(';')[0]; return value.slice(value.indexOf('=') + 1); }
  });

  // ------------------------------------------------------------------ evidence stores and migration shape
  await scenario('Migration 0019 is additive, one statement per piece, and rolls reviewed saves back whole', async ({ sqlite, review, marks, json, count }) => {
    const text = readFileSync(join(root, 'drizzle/0019_attendance_workflow.sql'), 'utf8');
    const pieces = text.split('--> statement-breakpoint').map(piece => piece.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
    check(pieces.length, 8, 'Eight one-statement pieces');
    for (const piece of pieces) {
      const body = piece.replace(/CREATE\s+TRIGGER[\s\S]*?\bEND\s*;?/i, 'T;');
      check(body.split(';').map(item => item.trim()).filter(Boolean).length, 1, 'Piece holds one statement: ' + piece.slice(0, 48));
    }
    check(pieces.filter(piece => /CREATE TRIGGER/.test(piece)).length, 4, 'One trigger per piece');
    const names = sqlite.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'attendance_changes%' OR name LIKE 'school_attendance%' ORDER BY name").all().map(row => row.name);
    check(names, ['attendance_changes', 'attendance_changes_class_date', 'attendance_changes_no_delete', 'attendance_changes_no_update', 'attendance_changes_on_delete', 'attendance_changes_on_update', 'attendance_changes_student', 'school_attendance_settings'], 'Objects created');
    check(sqlite.prepare("SELECT count(*) n FROM sqlite_schema WHERE name IN ('attendance_review_authority','attendance_review_commit','attendance_reviews_no_update')").get().n, 3, 'Migration 0013 guards remain');
    // A mid-batch fault still rolls back the reviewed marks, receipts and change log together.
    const date = '2026-10-05';
    await json(await review('teacher-a', await marks('teacher-a', date, { 'student-a': { status: 'present' }, 'pupil-one': { status: 'present' } }, 'Initial roll call for 2026-10-05')), 201, 'Initial marks');
    sqlite.exec("CREATE TRIGGER workflow_fault BEFORE INSERT ON attendance_review_entries WHEN NEW.student_id='pupil-one' AND json_extract(NEW.after_record,'$.status')='absent' BEGIN SELECT RAISE(ABORT,'synthetic fault'); END;");
    const before = sqlite.prepare('SELECT * FROM attendance ORDER BY id').all().map(row => ({ ...row }));
    const response = await review('teacher-a', await marks('teacher-a', date, { 'student-a': { status: 'late' }, 'pupil-one': { status: 'absent' } }, 'Faulted correction for atomicity.'));
    check(response.status, 500, 'Unexpected fault is a safe failure');
    check(sqlite.prepare('SELECT * FROM attendance ORDER BY id').all().map(row => ({ ...row })), before, 'Every mark keeps its prior value');
    check([count('attendance_reviews'), count('attendance_review_entries'), count('attendance_changes')], [1, 2, 0], 'Receipt, entries and change log all rolled back together');
    sqlite.exec('DROP TRIGGER workflow_fault');
  });
  // The same suite proves the reviewed path still works with the new triggers present.

  check(networkCalls, 0, 'No network calls');
  console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, networkCalls, limits: 'Real routes, opaque sessions and migrated SQLite; synthetic only; no browser, provider, hosted D1 or acceptance.' }));
} finally { globalThis.fetch = oldFetch; }
