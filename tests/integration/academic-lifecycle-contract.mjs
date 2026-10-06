// Reviewed course / class / enrolment lifecycle (FR-07, FR-08): actual routes, opaque sessions and SQLite (migration 0018).
// Exact request-UUID replay, atomic batches, capacity/closed/date/retired rules, current-assignment access and scoped history.
// Synthetic data only; no external request is possible (fetch is replaced and counted).
import assert from 'node:assert/strict';
import { freshDatabase, seedSecurityData, load, bindings, stamp } from '../support/security-db.mjs';
const origin = 'https://education.example.invalid'; bindings.SAHA_ALLOWED_ORIGINS = origin;
const session = await load('lib/education/session.ts');
const routes = {};
for (const [name, path] of Object.entries({
  changes: 'app/api/academic-changes/route.ts', change: 'app/api/academic-changes/[id]/route.ts', states: 'app/api/course-lifecycles/route.ts',
  courseLifecycle: 'app/api/courses/[id]/lifecycle/route.ts', courseHistory: 'app/api/courses/[id]/history/route.ts',
  classLifecycle: 'app/api/classes/[id]/lifecycle/route.ts', roster: 'app/api/classes/[id]/roster/route.ts', classHistory: 'app/api/classes/[id]/history/route.ts',
  studentHistory: 'app/api/enrolments/history/route.ts', legacyEnrolments: 'app/api/enrolments/route.ts', legacyClasses: 'app/api/classes/route.ts',
  legacyClass: 'app/api/classes/[id]/route.ts', legacyCourses: 'app/api/courses/route.ts', legacyCourse: 'app/api/courses/[id]/route.ts', classes: 'app/api/classes/route.ts',
})) routes[name] = await load(path);
const parameters = id => ({ params: Promise.resolve({ id }) });
let passed = 0, scenarios = 0, networkCalls = 0;
const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); passed++; };
const oldFetch = globalThis.fetch; globalThis.fetch = async () => { networkCalls++; throw new Error('Lifecycle contracts are offline only.'); };
const today = new Date().toISOString().slice(0, 10);
const addDays = (value, days) => new Date(Date.parse(value + 'T00:00:00.000Z') + days * 86400000).toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

async function scenario(name, action) {
  const fixture = freshDatabase(); await seedSecurityData(fixture.db, fixture.schema);
  const { sqlite } = fixture;
  const cookies = {};
  for (const actor of ['admin-a', 'admin-b', 'teacher-a', 'teacher-other', 'teacher-b', 'guardian-a', 'guardian-other', 'student-user-a', 'student-user-other']) cookies[actor] = (await session.createSession(actor)).split(';')[0];
  // A second enabled administrator and a few extra synthetic learners/teachers.
  const insertUser = sqlite.prepare('INSERT INTO users (id,name,email,role,school_id,identity_issuer,identity_subject,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  insertUser.run('admin-two', 'Synthetic second admin', 'admin-two@example.invalid', 'admin', 'a', 'https://identity.example.invalid', 'sub-admin-two', stamp, stamp);
  insertUser.run('teacher-new', 'Synthetic new teacher', 'teacher-new@example.invalid', 'teacher', 'a', 'https://identity.example.invalid', 'sub-teacher-new', stamp, stamp);
  insertUser.run('teacher-unmapped', 'Synthetic unmapped teacher', 'teacher-unmapped@example.invalid', 'teacher', 'a', null, null, stamp, stamp);
  for (const actor of ['admin-two', 'teacher-new']) cookies[actor] = (await session.createSession(actor)).split(';')[0];
  const insertStudent = sqlite.prepare('INSERT INTO students (id,school_id,first_name,last_name,date_of_birth,admission_number,grade_level,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const id of ['pupil-1', 'pupil-2', 'pupil-3', 'pupil-4']) insertStudent.run(id, 'a', 'Synthetic', id, '2012-01-01', 'ADM-' + id, '8', stamp, stamp);
  insertStudent.run('pupil-foreign', 'b', 'Synthetic', 'foreign', '2012-01-01', 'ADM-foreign', '8', stamp, stamp);
  const request = (actor, method = 'GET', data, path = '/api/academic-changes', selectedOrigin = origin) => new Request(origin + path, { method,
    headers: { ...(cookies[actor] ? { cookie: cookies[actor] } : {}), origin: selectedOrigin, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }) });
  const post = (actor, changes, extra = {}) => routes.changes.POST(request(actor, 'POST', { clientRequestId: uuid(), ...extra, changes }));
  const send = (actor, body) => routes.changes.POST(request(actor, 'POST', body));
  const get = (route, actor, path, id) => route.GET(request(actor, 'GET', undefined, path), id === undefined ? undefined : parameters(id));
  const row = (query, ...params) => { const found = sqlite.prepare(query).get(...params); return found && { ...found }; };
  const rows = (query, ...params) => sqlite.prepare(query).all(...params).map(found => ({ ...found }));
  const count = table => row(`SELECT count(*) n FROM ${table}`).n;
  const body = async response => response.json();
  const expect = async (response, status, code, message) => {
    check(response.status, status, message + ': status'); check(response.headers.get('cache-control'), 'no-store', message + ': no-store');
    const data = await response.json(); if (code !== undefined) check(data.code, code, message + ': stable code'); return data;
  };
  try { await action({ ...fixture, cookies, request, post, send, get, row, rows, count, body, expect }); scenarios++; }
  finally { fixture.sqlite.close(); }
}
const token = (sqlite, table, id) => sqlite.prepare(`SELECT updated_at u FROM ${table} WHERE id=?`).get(id).u;

try {
  await scenario('Course create, edit, retire and reinstate keep exact retry and immutable history', async ({ post, send, expect, row, rows, count, get, sqlite, request }) => {
    const create = { clientRequestId: uuid(), changes: [{ kind: 'course.create', code: 'SCI-8', title: 'Synthetic science', description: 'Plain description', gradeLevel: '8' }] };
    const first = await expect(await send('admin-a', create), 201, undefined, 'Reviewed course creation');
    check(first.replayed, false, 'First application is not a replay'); check(first.receipt.items.length, 1, 'One event'); check(first.receipt.createdBy, 'admin-a', 'Actor is server-derived');
    const course = row("SELECT * FROM courses WHERE code='SCI-8'"); check(course.school_id, 'a', 'School is derived from the verified session'); check(course.title, 'Synthetic science', 'Course saved');
    const replay = await expect(await send('admin-a', create), 200, undefined, 'Exact UUID retry'); check(replay.replayed, true, 'Exact retry is a replay'); check(replay.receipt, first.receipt, 'Replay returns the original receipt');
    check(count('courses'), 3, 'Replay creates no second course');
    await expect(await send('admin-a', { ...create, changes: [{ ...create.changes[0], title: 'Different title' }] }), 409, 'request-id-reused', 'Same UUID different payload');
    await expect(await send('admin-two', create), 409, 'request-id-reused', 'Another administrator cannot claim the UUID');
    await expect(await send('admin-b', create), 409, undefined, 'Another school cannot claim the UUID');
    check((await expect(await get(routes.change, 'admin-a', '/api/academic-changes/' + create.clientRequestId, create.clientRequestId), 200, undefined, 'Receipt recovery')).items.length, 1, 'Lost reply recovery returns the receipt');
    await expect(await get(routes.change, 'admin-two', '/api/academic-changes/' + create.clientRequestId, create.clientRequestId), 404, undefined, 'Other administrator cannot read the private receipt');
    await expect(await get(routes.change, 'teacher-a', '/api/academic-changes/' + create.clientRequestId, create.clientRequestId), 403, undefined, 'Teacher cannot read receipts');
    // code collisions are a conflict and leave nothing behind
    const before = [count('courses'), count('academic_change_requests'), count('academic_events')];
    await expect(await post('admin-a', [{ kind: 'course.create', code: 'SCI-8', title: 'Duplicate', gradeLevel: '8' }]), 409, 'course-code-taken', 'Global code uniqueness is a safe conflict');
    check([count('courses'), count('academic_change_requests'), count('academic_events')], before, 'Collision rolled back header, events and course');
    // edit with CAS
    const token1 = course.updated_at;
    await expect(await post('admin-a', [{ kind: 'course.edit', courseId: course.id, expectedUpdatedAt: token1, code: 'SCI-8', title: 'Synthetic science II', gradeLevel: '8' }]), 400, 'reason-required', 'Edits need a reason');
    const edit = { kind: 'course.edit', courseId: course.id, expectedUpdatedAt: token1, code: 'SCI-8', title: 'Synthetic science II', description: null, gradeLevel: '8' };
    const edited = await expect(await post('admin-a', [edit], { reason: 'Rename after review.' }), 201, undefined, 'Edit with reason');
    check(edited.receipt.items[0].payload.before.title, 'Synthetic science', 'Receipt keeps the before snapshot'); check(row('SELECT title,description FROM courses WHERE id=?', course.id), { title: 'Synthetic science II', description: null }, 'Edit applied');
    await expect(await post('admin-a', [edit], { reason: 'Rename after review.' }), 409, 'stale', 'Reusing the old token is stale (new request id)');
    await expect(await post('admin-a', [{ ...edit, expectedUpdatedAt: row('SELECT updated_at u FROM courses WHERE id=?', course.id).u }], { reason: 'No change here.' }), 400, 'no-change', 'No-op edits are refused');
    // retire blocks new classes everywhere, keeps old ones, can be reinstated
    const retire = { kind: 'course.retire', courseId: 'course-a', expectedUpdatedAt: token(sqlite, 'courses', 'course-a') };
    await expect(await post('admin-a', [retire], { reason: 'Course no longer offered.' }), 201, undefined, 'Retire');
    check(row("SELECT status,reason FROM course_lifecycle WHERE course_id='course-a'"), { status: 'retired', reason: 'Course no longer offered.' }, 'Retired state and reason');
    check((await get(routes.states, 'guardian-a', '/api/course-lifecycles')).status, 200, 'Every role can read retired state'); check((await (await get(routes.states, 'guardian-a', '/api/course-lifecycles')).json()).find(s => s.courseId === 'course-a').status, 'retired', 'Retired is visible');
    await expect(await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Blocked', term: 'T1' }]), 409, 'course-retired', 'Reviewed class creation blocks a retired course');
    const legacy = await routes.legacyClasses.POST(request('admin-a', 'POST', { schoolId: 'a', courseId: 'course-a', teacherId: 'teacher-a', name: 'Legacy blocked', term: 'T1' }, '/api/classes'));
    await expect(legacy, 409, 'course-retired', 'Legacy class creation cannot bypass retirement');
    check(row("SELECT count(*) n FROM classes WHERE course_id='course-a'").n, 2, 'Existing classes of a retired course are untouched');
    await expect(await post('admin-a', [{ ...retire, expectedUpdatedAt: token(sqlite, 'courses', 'course-a') }], { reason: 'Again please.' }), 409, 'already-retired', 'Cannot retire twice');
    await expect(await post('admin-a', [{ kind: 'course.reinstate', courseId: 'course-a', expectedUpdatedAt: token(sqlite, 'courses', 'course-a') }], { reason: 'Offered again.' }), 201, undefined, 'Reinstate');
    check(row("SELECT status FROM course_lifecycle WHERE course_id='course-a'").status, 'active', 'Reinstated'); check(await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Allowed again', term: 'T1' }]).then(r => r.status), 201, 'Class creation allowed again');
    const history = await expect(await get(routes.courseHistory, 'admin-a', '/api/courses/course-a/history', 'course-a'), 200, undefined, 'Course history');
    check(history.items.map(item => item.kind).sort(), ['course.reinstate', 'course.retire'], 'Both lifecycle events recorded'); check(history.items[0].reason, 'Offered again.', 'Administrator sees the reason');
    await expect(await get(routes.courseHistory, 'teacher-a', '/api/courses/course-a/history', 'course-a'), 403, undefined, 'Course history is administrator only');
    await expect(await get(routes.courseHistory, 'admin-b', '/api/courses/course-a/history', 'course-a'), 404, undefined, 'Foreign school admin sees nothing');
    const detail = await (await get(routes.courseLifecycle, 'teacher-a', '/api/courses/course-a/lifecycle', 'course-a')).json();
    check([detail.status, detail.canManage, detail.classCount, detail.statusReason], ['active', false, null, null], 'Teacher sees status only');
    // immutability
    for (const table of ['academic_change_requests', 'academic_events']) {
      assert.throws(() => sqlite.exec(`UPDATE ${table} SET created_at=created_at`), /immutable/); passed++;
      assert.throws(() => sqlite.exec(`DELETE FROM ${table}`), /immutable/); passed++;
    }
    check(rows('SELECT id FROM academic_events').length > 0, true, 'Evidence remains after attempted rewrite');
  });

  await scenario('Classes: capacity, dates, teacher assignment drives access, close and reopen', async ({ post, expect, row, rows, count, get, sqlite, request }) => {
    const created = await expect(await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-new', name: 'Synthetic 8B', term: 'T2', schedule: 'Mon 9:00', capacity: 2, startsOn: '2026-09-01', endsOn: '2026-12-20' }]), 201, undefined, 'Reviewed class creation');
    const classId = created.receipt.items[0].subjectId;
    check(row('SELECT teacher_id,name FROM classes WHERE id=?', classId), { teacher_id: 'teacher-new', name: 'Synthetic 8B' }, 'Class saved');
    check(row('SELECT capacity,starts_on,ends_on,status FROM class_settings WHERE class_id=?', classId), { capacity: 2, starts_on: '2026-09-01', ends_on: '2026-12-20', status: 'open' }, 'Settings saved');
    for (const [patch, code] of [[{ capacity: 0 }, undefined], [{ capacity: 501 }, undefined], [{ startsOn: '2026-02-30' }, undefined], [{ startsOn: '2026-12-30', endsOn: '2026-01-01' }, 'invalid-dates'], [{ teacherId: 'teacher-b' }, 'teacher-unavailable'], [{ teacherId: 'teacher-unmapped' }, 'teacher-unavailable'], [{ teacherId: 'guardian-a' }, 'teacher-unavailable'], [{ courseId: 'course-b' }, 'course-unavailable']]) {
      const response = await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Invalid', term: 'T1', ...patch }]);
      if (code) await expect(response, 409, code, 'Rejected input ' + JSON.stringify(patch)); else check(response.status, 400, 'Rejected input ' + JSON.stringify(patch));
    }
    check(count('classes'), 4, 'Rejected creations left no class');
    // teacher access follows the current assignment
    check((await get(routes.classLifecycle, 'teacher-new', '/api/classes/' + classId + '/lifecycle', classId)).status, 200, 'Assigned teacher can read the class');
    check((await get(routes.classLifecycle, 'teacher-a', '/api/classes/' + classId + '/lifecycle', classId)).status, 404, 'Other teacher cannot see the class');
    const reassign = await expect(await post('admin-a', [{ kind: 'class.teacher', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), teacherId: 'teacher-a' }], { reason: 'Timetable change.' }), 201, undefined, 'Reassign teacher');
    check(reassign.receipt.items[0].payload.fromTeacherName, 'Synthetic new teacher', 'History keeps the previous teacher name');
    check((await get(routes.classLifecycle, 'teacher-new', '/api/classes/' + classId + '/lifecycle', classId)).status, 404, 'Former teacher immediately loses access');
    check((await get(routes.roster, 'teacher-new', '/api/classes/' + classId + '/roster', classId)).status, 404, 'Former teacher loses the roster');
    check((await get(routes.classLifecycle, 'teacher-a', '/api/classes/' + classId + '/lifecycle', classId)).status, 200, 'New teacher gains access');
    await expect(await post('admin-a', [{ kind: 'class.teacher', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), teacherId: null }], { reason: 'Remove teacher.' }), 400, 'teacher-required', 'A class cannot be left without a teacher');
    await expect(await post('admin-a', [{ kind: 'class.teacher', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), teacherId: 'teacher-a' }], { reason: 'Same teacher.' }), 409, 'teacher-unchanged', 'Reassigning the same teacher is refused');
    await expect(await post('admin-a', [{ kind: 'class.teacher', classId, expectedUpdatedAt: stamp, teacherId: 'teacher-other' }], { reason: 'Stale view.' }), 409, 'stale', 'Stale teacher change');
    // capacity: enrolments and lowering below the active count
    const dateOk = '2026-10-05';
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: dateOk }, { kind: 'enrolment.enrol', studentId: 'pupil-2', classId, effectiveOn: dateOk }]), 201, undefined, 'Fill to capacity');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-3', classId, effectiveOn: dateOk }]), 409, 'class-full', 'Capacity is enforced');
    check(count('enrolments'), 5, 'Full class accepted nothing more');
    await expect(await post('admin-a', [{ kind: 'class.edit', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), courseId: 'course-a', name: 'Synthetic 8B', term: 'T2', capacity: 1, startsOn: '2026-09-01', endsOn: '2026-12-20' }], { reason: 'Shrink class.' }), 409, 'capacity-below-active', 'Capacity cannot drop below active learners');
    await expect(await post('admin-a', [{ kind: 'class.edit', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), courseId: 'course-a', name: 'Synthetic 8B', term: 'T2', capacity: 3, startsOn: '2026-09-01', endsOn: '2026-12-20' }], { reason: 'Add a seat.' }), 201, undefined, 'Raise capacity');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-3', classId, effectiveOn: dateOk }]), 201, undefined, 'Third learner now fits');
    // legacy enrolment path cannot bypass capacity
    const legacy = await routes.legacyEnrolments.POST(request('admin-a', 'POST', { studentId: 'pupil-4', classId }, '/api/enrolments'));
    await expect(legacy, 409, 'class-full', 'Legacy enrolment obeys capacity');
    // close with completion
    const closed = await expect(await post('admin-a', [{ kind: 'class.close', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), completeActive: true }], { reason: 'End of term.' }), 201, undefined, 'Close and complete');
    check(closed.receipt.items.map(item => item.kind).sort(), ['class.close', 'enrolment.complete', 'enrolment.complete', 'enrolment.complete'], 'One event per completed enrolment');
    check(rows('SELECT status FROM enrolments WHERE class_id=?', classId).map(r => r.status), ['completed', 'completed', 'completed'], 'Active enrolments completed');
    check(row('SELECT status FROM class_settings WHERE class_id=?', classId).status, 'closed', 'Class closed');
    check(rows("SELECT end_kind FROM enrolment_lifecycle WHERE enrolment_id IN (SELECT id FROM enrolments WHERE class_id=?)", classId).map(r => r.end_kind), ['completed', 'completed', 'completed'], 'Completion dates recorded');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-4', classId, effectiveOn: dateOk }]), 409, 'class-closed', 'Closed class refuses enrolment');
    await expect(await routes.legacyEnrolments.POST(request('admin-a', 'POST', { studentId: 'pupil-4', classId }, '/api/enrolments')), 409, 'class-closed', 'Legacy path respects closure');
    await expect(await post('admin-a', [{ kind: 'class.edit', classId, expectedUpdatedAt: token(sqlite, 'classes', classId), courseId: 'course-a', name: 'Renamed', term: 'T2', capacity: 3, startsOn: '2026-09-01', endsOn: '2026-12-20' }], { reason: 'Edit closed.' }), 409, 'class-closed', 'Closed classes cannot be edited');
    await expect(await post('admin-a', [{ kind: 'class.close', classId, expectedUpdatedAt: token(sqlite, 'classes', classId) }], { reason: 'Twice.' }), 409, 'class-closed', 'Cannot close twice');
    await expect(await post('admin-a', [{ kind: 'class.reopen', classId, expectedUpdatedAt: token(sqlite, 'classes', classId) }], { reason: 'More teaching needed.' }), 201, undefined, 'Reopen');
    await expect(await post('admin-a', [{ kind: 'class.reopen', classId, expectedUpdatedAt: token(sqlite, 'classes', classId) }], { reason: 'Again.' }), 409, 'not-closed', 'Cannot reopen an open class');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-4', classId, effectiveOn: dateOk }]), 201, undefined, 'Reopened class accepts enrolment');
    const history = await (await get(routes.classHistory, 'admin-a', '/api/classes/' + classId + '/history', classId)).json();
    check(history.items.some(item => item.kind === 'class.close' && item.reason === 'End of term.'), true, 'Administrator history carries the reason'); check(history.items.length >= 9, true, 'History lists all class events');
    const teacherHistory = await (await get(routes.classHistory, 'teacher-a', '/api/classes/' + classId + '/history', classId)).json();
    check(teacherHistory.items.every(item => item.reason === null && item.actorName === null), true, 'Teacher history omits reasons and actors');
  });

  await scenario('Enrolment lifecycle: date rules, withdraw, re-enrol, transfer, exact retry and receipts', async ({ post, send, expect, row, rows, count, get, sqlite, body }) => {
    const enrolmentId = 'student-a-enrolment';
    const withdraw = (effectiveOn, expectedUpdatedAt = token(sqlite, 'enrolments', enrolmentId)) => [{ kind: 'enrolment.withdraw', enrolmentId, expectedUpdatedAt, effectiveOn }];
    await expect(await post('admin-a', withdraw(today)), 400, 'reason-required', 'Withdrawal needs a reason');
    await expect(await post('admin-a', withdraw('2026-02-30'), { reason: 'Invalid day.' }), 400, undefined, 'Impossible calendar date is rejected at the boundary');
    await expect(await post('admin-a', withdraw('2026-10-04'), { reason: 'Before it started.' }), 409, 'date-before-start', 'Withdrawal before the enrolment started');
    await expect(await post('admin-a', withdraw(addDays(today, 3)), { reason: 'Dated ahead.' }), 409, 'date-in-future', 'Withdrawal cannot be dated ahead');
    await expect(await post('admin-a', withdraw(today, stamp.replace('00:00:00', '00:00:01')), { reason: 'Wrong token.' }), 409, 'stale', 'Stale enrolment token');
    check(row('SELECT status FROM enrolments WHERE id=?', enrolmentId).status, 'active', 'Rejected requests changed nothing');
    const request1 = { clientRequestId: uuid(), reason: 'Family moved away.', changes: withdraw(today) };
    const done = await expect(await send('admin-a', request1), 201, undefined, 'Withdraw');
    check(done.receipt.items[0].label.startsWith('Withdrew '), true, 'Receipt has a plain-language label'); check(done.receipt.items[0].effectiveOn, today, 'Effective date is recorded');
    check(row('SELECT status FROM enrolments WHERE id=?', enrolmentId).status, 'withdrawn', 'Status withdrawn');
    check(row('SELECT started_on,ended_on,end_kind FROM enrolment_lifecycle WHERE enrolment_id=?', enrolmentId), { started_on: '2026-10-05', ended_on: today, end_kind: 'withdrawn' }, 'Lifecycle dates recorded from the legacy start');
    const replay = await expect(await send('admin-a', request1), 200, undefined, 'Lost reply replay'); check(replay.replayed, true, 'Replay flagged'); check(replay.receipt, done.receipt, 'Replay returns the original immutable receipt');
    check(count('academic_events'), 1, 'Replay wrote no second event');
    await expect(await post('admin-a', withdraw(today), { reason: 'Again.' }), 409, 'not-active', 'A second withdrawal with a new request id changes nothing');
    check(count('academic_events'), 1, 'The refused second withdrawal wrote no event');
    await expect(await post('admin-a', [{ kind: 'enrolment.complete', enrolmentId, expectedUpdatedAt: token(sqlite, 'enrolments', enrolmentId), effectiveOn: today }], { reason: 'Complete a withdrawn.' }), 409, 'not-active', 'Only active enrolments can be completed');
    // roster / learner views
    const roster = await (await get(routes.roster, 'teacher-a', '/api/classes/class-a/roster', 'class-a')).json();
    check(roster.map(r => [r.studentId, r.status, r.startedOn, r.endedOn, r.endKind]), [['student-a', 'withdrawn', '2026-10-05', today, 'withdrawn']], 'Teacher sees withdrawn history on the assigned class roster');
    // re-enrol
    const reenrol = (effectiveOn, expectedUpdatedAt = token(sqlite, 'enrolments', enrolmentId)) => [{ kind: 'enrolment.reenrol', enrolmentId, expectedUpdatedAt, effectiveOn }];
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'student-a', classId: 'class-a', effectiveOn: today }]), 409, 'already-enrolled', 'Enrol of an existing pair points to re-enrol');
    await expect(await post('admin-a', reenrol('2026-10-05'), { reason: 'Before it ended.' }), 409, 'date-before-end', 'Re-enrolment cannot precede the withdrawal date');
    await expect(await post('admin-a', reenrol(today), { reason: 'Returned to school.' }), 201, undefined, 'Re-enrol');
    check(row('SELECT status FROM enrolments WHERE id=?', enrolmentId).status, 'active', 'Reactivated on the same row'); check(row("SELECT count(*) n FROM enrolments WHERE student_id='student-a' AND class_id='class-a'").n, 1, 'No duplicate pair row is created');
    check(row('SELECT started_on,ended_on,end_kind FROM enrolment_lifecycle WHERE enrolment_id=?', enrolmentId), { started_on: today, ended_on: null, end_kind: null }, 'New stint recorded; earlier stint stays in events');
    await expect(await post('admin-a', reenrol(today), { reason: 'Already active.' }), 409, 'already-active', 'Active enrolment cannot be re-enrolled');
    check((await expect(await get(routes.studentHistory, 'admin-a', '/api/enrolments/history?studentId=student-a'), 200, undefined, 'Student history')).events.map(e => e.kind), ['enrolment.reenrol', 'enrolment.withdraw'], 'History lists both transitions newest first');
    // transfer
    const transfer = (toClassId, effectiveOn = today, expectedUpdatedAt = token(sqlite, 'enrolments', enrolmentId)) => [{ kind: 'enrolment.transfer', enrolmentId, expectedUpdatedAt, toClassId, effectiveOn }];
    await expect(await post('admin-a', transfer('class-a'), { reason: 'Same class.' }), 400, 'same-class', 'Transfer to the same class');
    await expect(await post('admin-a', transfer('class-b'), { reason: 'Foreign school class.' }), 404, 'not-found', 'Transfer to a foreign-school class');
    await expect(await post('admin-a', transfer('class-other', addDays(today, 2)), { reason: 'Dated ahead.' }), 409, 'date-in-future', 'Transfer cannot be dated ahead');
    const moved = await expect(await post('admin-a', transfer('class-other'), { reason: 'Timetable move.' }), 201, undefined, 'Transfer');
    check(moved.receipt.items[0].relatedClassId, 'class-other', 'Destination is recorded');
    check(rows("SELECT class_id,status FROM enrolments WHERE student_id='student-a' ORDER BY class_id"), [{ class_id: 'class-a', status: 'withdrawn' }, { class_id: 'class-other', status: 'active' }], 'Source ended and destination active in one request');
    check(row('SELECT end_kind FROM enrolment_lifecycle WHERE enrolment_id=?', enrolmentId).end_kind, 'transferred', 'Source marked as transferred');
    check((await get(routes.classHistory, 'admin-a', '/api/classes/class-other/history', 'class-other').then(body)).items.some(e => e.kind === 'enrolment.transfer'), true, 'Destination class history shows the transfer in');
    const outLabel = (await get(routes.classHistory, 'teacher-a', '/api/classes/class-a/history', 'class-a').then(body)).items.find(e => e.kind === 'enrolment.transfer').label;
    check(outLabel.includes('class-other'), false, 'Source teacher does not learn the destination class name'); check(outLabel.includes('out of'), true, 'Source teacher still sees the transfer out');
    const learnerView = actor => get(routes.studentHistory, actor, '/api/enrolments/history?studentId=student-a');
    check((await learnerView('teacher-a')).status, 404, 'A teacher no longer reads a learner who has left their class (existing active-enrolment scope)');
    const destinationView = await body(await learnerView('teacher-other'));
    check(destinationView.enrolments.map(e => e.classId), ['class-other'], 'The destination teacher sees only the enrolment in their class');
    check(destinationView.events.some(e => e.kind === 'enrolment.transfer' && e.label.includes('into class-other') && !e.label.includes('class-a')), true, 'Destination teacher history shows the transfer in without the source name');
    check(destinationView.events.every(e => e.reason === null && e.actorName === null), true, 'Teachers never receive reasons or actors');
    check(destinationView.events.every(e => !e.label.includes('class-a')), true, 'No event shown to the destination teacher names the class the learner came from');
    await expect(await post('admin-a', transfer('class-other'), { reason: 'Back again.' }), 409, 'not-active', 'The ended source enrolment cannot be transferred again');
    const newToken = token(sqlite, 'enrolments', row("SELECT id FROM enrolments WHERE student_id='student-a' AND class_id='class-other'").id);
    const back = await expect(await post('admin-a', [{ kind: 'enrolment.transfer', enrolmentId: row("SELECT id FROM enrolments WHERE student_id='student-a' AND class_id='class-other'").id, expectedUpdatedAt: newToken, toClassId: 'class-a', effectiveOn: today }], { reason: 'Back to the first class.' }), 201, undefined, 'Transfer back reuses the withdrawn pair row');
    check(row("SELECT count(*) n FROM enrolments WHERE student_id='student-a' AND class_id='class-a'").n, 1, 'Transfer back creates no duplicate'); check(row('SELECT status FROM enrolments WHERE id=?', enrolmentId).status, 'active', 'Original row active again');
    check(back.receipt.items[0].kind, 'enrolment.transfer', 'Receipt kind');
  });

  await scenario('Atomic batches, capacity races and exact concurrent retry', async ({ post, send, expect, row, rows, count, sqlite }) => {
    const created = await expect(await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Small class', term: 'T3', capacity: 2 }]), 201, undefined, 'Small class');
    const classId = created.receipt.items[0].subjectId, dateOk = '2026-10-05';
    const before = [count('enrolments'), count('academic_events'), count('academic_change_requests'), count('enrolment_lifecycle')];
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: dateOk }, { kind: 'enrolment.enrol', studentId: 'pupil-2', classId, effectiveOn: dateOk }, { kind: 'enrolment.enrol', studentId: 'pupil-3', classId, effectiveOn: dateOk }]), 409, 'class-full', 'Third row of a batch exceeds capacity');
    check([count('enrolments'), count('academic_events'), count('academic_change_requests'), count('enrolment_lifecycle')], before, 'The whole batch rolled back: no enrolment, event, header or lifecycle row');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: dateOk }, { kind: 'enrolment.enrol', studentId: 'pupil-foreign', classId, effectiveOn: dateOk }]), 404, 'student-unavailable', 'A foreign learner fails the batch before any write');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: dateOk }, { kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: dateOk }]), 400, 'duplicate-subject', 'The same pair twice in one request');
    check(count('enrolments'), before[0], 'Pre-write failures left nothing');
    check(rows('SELECT 1 FROM academic_events').length, before[1], 'No events from failed requests');
    // mixed-kind batch commits together
    const mixed = await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: dateOk }, { kind: 'enrolment.enrol', studentId: 'pupil-2', classId, effectiveOn: dateOk }, { kind: 'course.create', code: 'MIX-1', title: 'Created with learners', gradeLevel: '8' }]), 201, undefined, 'Mixed batch');
    check(mixed.receipt.items.map(i => i.seq), [0, 1, 2], 'Receipt keeps request order'); check(row("SELECT count(*) n FROM enrolments WHERE class_id=?", classId).n, 2, 'Both learners enrolled'); check(row("SELECT count(*) n FROM courses WHERE code='MIX-1'").n, 1, 'And the course created in the same request');
    // 25 changes max, 26 rejected
    const many = Array.from({ length: 26 }, (_, i) => ({ kind: 'course.create', code: 'BULK-' + i, title: 'Bulk ' + i, gradeLevel: '8' }));
    check((await post('admin-a', many)).status, 400, 'More than 25 changes are refused'); check((await post('admin-a', [])).status, 400, 'An empty request is refused');
    const twentyFive = await post('admin-a', many.slice(0, 25)); check(twentyFive.status, 201, 'Exactly 25 changes commit'); check(row("SELECT count(*) n FROM courses WHERE code LIKE 'BULK-%'").n, 25, 'All 25 courses exist');
    // a failure in the last of 25 rolls back all 25
    const failing = many.slice(0, 24).map((c, i) => ({ ...c, code: 'ROLL-' + i })).concat([{ kind: 'course.create', code: 'BULK-0', title: 'Collides', gradeLevel: '8' }]);
    await expect(await post('admin-a', failing), 409, 'course-code-taken', 'Last-item collision'); check(row("SELECT count(*) n FROM courses WHERE code LIKE 'ROLL-%'").n, 0, 'The first 24 were rolled back');
    // concurrent identical retries: one commit, one replay, exactly one effect
    const concurrentClass = (await (await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Race', term: 'T3', capacity: 5 }])).json()).receipt.items[0].subjectId;
    const same = { clientRequestId: uuid(), changes: [{ kind: 'enrolment.enrol', studentId: 'pupil-3', classId: concurrentClass, effectiveOn: dateOk }] };
    const results = await Promise.all([send('admin-a', same), send('admin-a', same), send('admin-a', same)]);
    check(results.map(r => r.status).sort(), [200, 200, 201], 'One creation and two replays under concurrency');
    check(row('SELECT count(*) n FROM enrolments WHERE class_id=?', concurrentClass).n, 1, 'Exactly one enrolment'); check(row('SELECT count(*) n FROM academic_change_requests WHERE id=?', same.clientRequestId).n, 1, 'Exactly one header');
    // two different requests racing for the last seat: exactly one wins
    const seat = (await (await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Last seat', term: 'T3', capacity: 1 }])).json()).receipt.items[0].subjectId;
    const racers = await Promise.all(['pupil-1', 'pupil-2', 'pupil-3', 'pupil-4'].map(studentId => post('admin-a', [{ kind: 'enrolment.enrol', studentId, classId: seat, effectiveOn: dateOk }])));
    check(racers.map(r => r.status).sort(), [201, 409, 409, 409], 'Only one request wins the last seat'); check(row("SELECT count(*) n FROM enrolments WHERE class_id=? AND status='active'", seat).n, 1, 'Active count never exceeds capacity');
    // pre-enrolment into a future class and window rules
    const future = (await (await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Next term', term: 'T4', startsOn: addDays(today, 30), endsOn: addDays(today, 120) }])).json()).receipt.items[0].subjectId;
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-3', classId: future, effectiveOn: addDays(today, 10) }]), 409, 'date-before-class-start', 'An enrolment cannot start before the class does');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId: future, effectiveOn: addDays(today, 30) }]), 201, undefined, 'Pre-enrolment takes effect on the class start date');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-2', classId: future, effectiveOn: addDays(today, 31) }]), 409, 'date-in-future', 'Dated after the start is ahead of today');
    const started = (await (await post('admin-a', [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'Windowed', term: 'T4', startsOn: addDays(today, -20), endsOn: addDays(today, -10) }])).json()).receipt.items[0].subjectId;
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId: started, effectiveOn: addDays(today, -30) }]), 409, 'date-before-class-start', 'Before the class start');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId: started, effectiveOn: today }]), 409, 'date-after-class-end', 'After the class end');
    await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId: started, effectiveOn: addDays(today, -15) }]), 201, undefined, 'Inside the window');
  });

  await scenario('Visibility: teachers see assigned classes only; families and learners see only their own enrolments', async ({ post, send, expect, get, request, body, count, sqlite }) => {
    await expect(await post('admin-a', [{ kind: 'enrolment.withdraw', enrolmentId: 'student-other-enrolment', expectedUpdatedAt: stamp, effectiveOn: today }], { reason: 'Other family moved.' }), 201, undefined, 'Seed a second history');
    for (const [route, path, id] of [[routes.classLifecycle, '/api/classes/class-a/lifecycle', 'class-a'], [routes.roster, '/api/classes/class-a/roster', 'class-a'], [routes.classHistory, '/api/classes/class-a/history', 'class-a'], [routes.studentHistory, '/api/enrolments/history?studentId=student-a'], [routes.states, '/api/course-lifecycles'], [routes.courseLifecycle, '/api/courses/course-a/lifecycle', 'course-a']]) {
      check((await get(route, null, path, id)).status, 401, 'Unauthenticated ' + path);
    }
    const lifecycle = actor => get(routes.classLifecycle, actor, '/api/classes/class-a/lifecycle', 'class-a');
    check((await lifecycle('guardian-a')).status, 200, 'Linked guardian reads the class summary'); const family = await body(await lifecycle('guardian-a'));
    check([family.activeCount, family.settings.capacity, family.canManage], [null, null, false], 'Family receives no roster counts, capacity or controls');
    check((await lifecycle('student-user-a')).status, 200, 'Linked learner reads the class summary'); check((await lifecycle('guardian-other')).status, 404, 'Unrelated guardian cannot see the class');
    check((await lifecycle('teacher-other')).status, 404, 'Unassigned teacher cannot see the class'); check((await lifecycle('admin-b')).status, 404, 'Other school administrator cannot see the class');
    const staff = await body(await lifecycle('teacher-a')); check([staff.activeCount, staff.canManage, staff.teacher.id], [1, false, 'teacher-a'], 'Assigned teacher sees counts but no management controls');
    for (const actor of ['guardian-a', 'student-user-a']) { check((await get(routes.roster, actor, '/api/classes/class-a/roster', 'class-a')).status, 403, actor + ' cannot read rosters'); check((await get(routes.classHistory, actor, '/api/classes/class-a/history', 'class-a')).status, 403, actor + ' cannot read class history'); }
    check((await get(routes.roster, 'teacher-other', '/api/classes/class-a/roster', 'class-a')).status, 404, 'Unassigned teacher roster hidden'); check((await get(routes.roster, 'admin-b', '/api/classes/class-a/roster', 'class-a')).status, 404, 'Foreign admin roster hidden');
    const history = actor => get(routes.studentHistory, actor, '/api/enrolments/history?studentId=student-a');
    check((await history('guardian-a')).status, 200, 'Guardian reads own learner'); check((await history('student-user-a')).status, 200, 'Learner reads own history');
    check((await history('guardian-other')).status, 404, 'Another family cannot read it'); check((await history('teacher-other')).status, 404, 'Unrelated teacher cannot read it'); check((await history('admin-b')).status, 404, 'Foreign admin cannot read it');
    check((await get(routes.studentHistory, 'guardian-a', '/api/enrolments/history?studentId=student-other')).status, 404, 'Guardian cannot read another learner');
    check((await get(routes.studentHistory, 'guardian-a', '/api/enrolments/history')).status, 400, 'Missing learner id is a bad request');
    const own = await body(await history('guardian-a')); check(own.enrolments.map(e => [e.classId, e.status]), [['class-a', 'active']], 'Family sees only its own enrolments'); check(own.events, [], 'No event yet for this learner');
    await post('admin-a', [{ kind: 'enrolment.withdraw', enrolmentId: 'student-a-enrolment', expectedUpdatedAt: stamp, effectiveOn: today }], { reason: 'Private administrator reason.' });
    const after = await body(await history('guardian-a')); check(after.events.length, 1, 'Family sees its learner event'); check([after.events[0].reason, after.events[0].actorName], [null, null], 'Family never receives the administrator reason or actor');
    check(JSON.stringify(after).includes('Private administrator reason'), false, 'The reason text is absent from the whole response'); check(JSON.stringify(after).includes('student-other'), false, 'No other learner is present');
    const admin = await body(await get(routes.studentHistory, 'admin-a', '/api/enrolments/history?studentId=student-a')); check(admin.events[0].reason, 'Private administrator reason.', 'Administrator sees the reason');
    // mutation boundary: role before body, origin, size and unknown fields
    for (const actor of ['teacher-a', 'guardian-a', 'student-user-a']) { const response = await routes.changes.POST(request(actor, 'POST', '{')); check(response.status, 403, actor + ' denied before JSON parse'); }
    check((await routes.changes.POST(request(null, 'POST', '{'))).status, 401, 'Unauthenticated mutation'); check((await routes.changes.POST(request('admin-a', 'POST', { clientRequestId: uuid(), changes: [{ kind: 'course.create', code: 'X', title: 'Y', gradeLevel: '8' }] }, '/api/academic-changes', 'https://evil.example.invalid'))).status, 403, 'Cross-origin mutation refused');
    check((await routes.changes.POST(request('admin-a', 'POST', '{'))).status, 400, 'Malformed JSON'); check((await send('admin-a', { clientRequestId: uuid(), changes: [{ kind: 'course.create', code: 'X', title: 'Y', gradeLevel: '8', schoolId: 'b' }] })).status, 400, 'Unknown fields (school override) are refused');
    check((await send('admin-a', { clientRequestId: 'not-a-uuid', changes: [{ kind: 'course.create', code: 'X', title: 'Y', gradeLevel: '8' }] })).status, 400, 'Request id must be a UUID'); check((await send('admin-a', { clientRequestId: uuid(), changes: [{ kind: 'course.create', code: 'X<b>', title: 'Y', gradeLevel: '8' }] })).status, 400, 'Markup characters are refused');
    check((await routes.changes.POST(request('admin-a', 'POST', 'x'.repeat(200 * 1024)))).status, 400, 'Oversized body refused'); check(count('academic_change_requests'), 1 + 1, 'Only the two valid requests were recorded');
    // legacy PATCH on an enrolment follows the same capacity/closed rules
    sqlite.exec("INSERT INTO class_settings(class_id,capacity,status,updated_at) VALUES('class-other',1,'open','2026-10-05T00:00:00.000Z')");
    sqlite.exec("INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES('legacy-extra','pupil-1','class-other','withdrawn','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-10-01T00:00:00.000Z')");
    sqlite.exec("UPDATE enrolments SET status='active' WHERE id='student-other-enrolment'");
    const reactivate = await routes.legacyEnrolments.PATCH(request('admin-a', 'PATCH', { id: 'legacy-extra', status: 'active' }, '/api/enrolments')); await expect(reactivate, 409, 'class-full', 'Legacy status PATCH cannot exceed capacity');
  });

  await scenario('Production D1 driver: one write statement per request and no batch API', async ({ post, send, expect, row, count, sqlite, schema, db }) => {
    const { drizzle: d1Drizzle } = await import('drizzle-orm/d1');
    const writes = [];
    const track = query => { if (/^\s*(insert|update|delete)\b/i.test(query)) writes.push(query.replace(/\s+/g, ' ').slice(0, 60)); };
    const prepared = (query, parameters = []) => ({
      bind(...values) { return prepared(query, values); },
      async run() { track(query); const statement = sqlite.prepare(query); if (statement.columns().length) return { success: true, results: statement.all(...parameters), meta: {} }; const result = statement.run(...parameters); return { success: true, results: [], meta: { changes: Number(result.changes) } }; },
      async all() { track(query); return { success: true, results: sqlite.prepare(query).all(...parameters), meta: {} }; },
      async raw() { track(query); const statement = sqlite.prepare(query); statement.setReturnArrays(true); return statement.all(...parameters); },
    });
    globalThis.__sahaTestDb = d1Drizzle({ prepare: prepared }, { schema });
    try {
      const requestId = uuid(); const batch = { clientRequestId: requestId, changes: [{ kind: 'class.create', courseId: 'course-a', teacherId: 'teacher-a', name: 'D1 class', term: 'T3', capacity: 3 }, { kind: 'course.create', code: 'D1-1', title: 'D1 course', gradeLevel: '8' }] };
      writes.length = 0;
      const first = await expect(await send('admin-a', batch), 201, undefined, 'D1 multi-change request');
      check(writes.filter(query => /academic_change_requests/i.test(query)).length, 1, 'The whole request is exactly one driver write statement'); check(writes.length, 1, 'No other driver write: effects come from triggers in the same statement');
      check([count('courses'), row("SELECT count(*) n FROM classes WHERE name='D1 class'").n], [3, 1], 'Class and course both applied through D1');
      writes.length = 0; const replay = await expect(await send('admin-a', batch), 200, undefined, 'D1 replay'); check(replay.receipt, first.receipt, 'D1 replay returns the original receipt'); check(writes.length, 0, 'A replay issues no write');
      const classId = first.receipt.items[0].subjectId; writes.length = 0;
      await expect(await post('admin-a', [{ kind: 'enrolment.enrol', studentId: 'pupil-1', classId, effectiveOn: today }, { kind: 'enrolment.enrol', studentId: 'pupil-2', classId, effectiveOn: today }, { kind: 'enrolment.enrol', studentId: 'pupil-3', classId, effectiveOn: today }, { kind: 'enrolment.enrol', studentId: 'pupil-4', classId, effectiveOn: today }]), 409, 'class-full', 'D1 capacity conflict');
      check(row('SELECT count(*) n FROM enrolments WHERE class_id=?', classId).n, 0, 'D1 conflict left no partial enrolment');
    } finally { globalThis.__sahaTestDb = db; }
  });

  await scenario('Authority is decided inside the write: disabled or unlinked administrators write nothing', async ({ post, send, expect, row, count, sqlite, request }) => {
    const principalFor = async actor => (await session.principalForToken(cookies0(request, actor)));
    const cookies0 = (build, actor) => { const value = build(actor, 'GET').headers.get('cookie'); return value.slice(value.indexOf('=') + 1); };
    const lifecycle = await load('lib/education/academic-lifecycle.ts');
    const principal = await principalFor('admin-two'); check(principal?.role, 'admin', 'Second administrator resolves a live principal');
    const input = changes => ({ clientRequestId: uuid(), changes });
    const before = [count('courses'), count('academic_change_requests'), count('academic_events')];
    sqlite.exec("UPDATE users SET disabled_at='2026-10-05T00:00:00.000Z' WHERE id='admin-two'");
    let failure; try { await lifecycle.applyAcademicChanges(principal, input([{ kind: 'course.create', code: 'LATE-1', title: 'Late', gradeLevel: '8' }])); } catch (error) { failure = error; }
    check([failure?.code, failure?.status], ['authority', 409], 'A principal disabled after verification is refused at the write');
    check([count('courses'), count('academic_change_requests'), count('academic_events')], before, 'Nothing was written for the disabled actor');
    check((await send('admin-two', input([{ kind: 'course.create', code: 'LATE-2', title: 'Late', gradeLevel: '8' }]))).status >= 400, true, 'A disabled administrator is refused at the route as well');
    sqlite.exec("UPDATE users SET disabled_at=NULL WHERE id='admin-two'");
    sqlite.exec("UPDATE users SET identity_subject=NULL WHERE id='admin-two'");
    failure = undefined; try { await lifecycle.applyAcademicChanges(principal, input([{ kind: 'course.create', code: 'LATE-3', title: 'Late', gradeLevel: '8' }])); } catch (error) { failure = error; }
    check(failure?.code, 'authority', 'An administrator whose identity link was removed is refused'); sqlite.exec("UPDATE users SET identity_subject='sub-admin-two' WHERE id='admin-two'");
    // The database itself enforces the same guard against any other writer.
    const header = (actor, id, count_ = 1) => sqlite.prepare("INSERT INTO academic_change_requests(id,school_id,actor_id,request_hash,reason,items_json,item_count,created_at) VALUES (?,?,?,?,NULL,?,?,?)")
      .run(id, 'a', actor, 'a'.repeat(64),JSON.stringify([{ id: uuid(), kind: 'course.create', subjectId: uuid(), payload: { code: 'DIRECT', title: 'Direct', gradeLevel: '8' } }]), count_, stamp);
    const message = run => { try { run(); return ''; } catch (error) { return String(error.message); } };
    check(message(() => header('teacher-a', uuid())).includes('saha_academic_conflict:authority'), true, 'A teacher cannot author a request even by direct SQL');
    check(message(() => header('admin-b', uuid())).includes('saha_academic_conflict:authority'), true, 'An administrator of another school cannot author a request for this one');
    check(message(() => header('admin-a', 'not-a-uuid')).includes('saha_academic_conflict:invalid-request'), true, 'The request id must be UUID shaped');
    check(message(() => header('admin-a', uuid(), 3)).includes('saha_academic_conflict:invalid-request'), true, 'The declared item count must match the items');
    check([count('courses'), count('academic_change_requests'), count('academic_events')], before, 'Rejected direct writes left nothing behind');
    // optimistic concurrency is enforced by the database as well, for any writer that skips the service pre-check
    const raw = (kind, subjectId, parts, payload) => sqlite.prepare("INSERT INTO academic_change_requests(id,school_id,actor_id,request_hash,reason,items_json,item_count,created_at) VALUES (?,?,?,?,NULL,?,1,?)")
      .run(uuid(), 'a', 'admin-a', 'c'.repeat(64), JSON.stringify([{ id: uuid(), kind, subjectId, classId: null, relatedClassId: null, studentId: null, effectiveOn: null, ...parts, payload }]), new Date().toISOString());
    const oldToken = '1999-01-01T00:00:00.000Z';
    const edit = expectedUpdatedAt => () => raw('course.edit', 'course-a', {}, { expectedUpdatedAt, code: 'course-a', title: 'Direct edit', description: null, gradeLevel: '8', before: {} });
    check(message(edit(oldToken)).includes('saha_academic_conflict:stale'), true, 'A stale course token is refused by the database');
    check(row("SELECT title FROM courses WHERE id='course-a'").title, 'Synthetic math', 'The stale direct edit changed nothing');
    check(message(() => raw('enrolment.withdraw', 'student-a-enrolment', { classId: 'class-a', studentId: 'student-a', effectiveOn: today }, { expectedUpdatedAt: oldToken, studentName: 'x', className: 'y', previousStatus: 'active' })).includes('saha_academic_conflict:stale'), true, 'A stale enrolment token is refused by the database');
    check(message(() => raw('class.close', 'class-a', { classId: 'class-a' }, { expectedUpdatedAt: oldToken, className: 'class-a', completeActive: false })).includes('saha_academic_conflict:stale'), true, 'A stale class token is refused by the database');
    check(row("SELECT status FROM enrolments WHERE id='student-a-enrolment'").status, 'active', 'The stale direct withdrawal changed nothing');
    check(message(edit(row("SELECT updated_at u FROM courses WHERE id='course-a'").u)), '', 'The same direct edit with the current token is accepted (control)'); check(row("SELECT title FROM courses WHERE id='course-a'").title, 'Direct edit', 'The accepted direct edit applied');
    // immutability
    const ok = uuid(); header('admin-a', ok);
    check(message(() => sqlite.exec(`UPDATE academic_change_requests SET reason='tamper' WHERE id='${ok}'`)).includes('immutable'), true, 'A recorded request cannot be edited');
    check(message(() => sqlite.exec(`DELETE FROM academic_change_requests WHERE id='${ok}'`)).includes('immutable'), true, 'A recorded request cannot be deleted');
    check(message(() => sqlite.exec(`UPDATE academic_events SET effective_on='2000-01-01' WHERE request_id='${ok}'`)).includes('immutable'), true, 'A recorded event cannot be edited');
    check(message(() => sqlite.exec(`DELETE FROM academic_events WHERE request_id='${ok}'`)).includes('immutable'), true, 'A recorded event cannot be deleted');
  });

  await scenario('Legacy data: duplicate pairs stay ambiguous, existing rows are untouched, older data is preserved by the migration', async ({ post, expect, row, rows, sqlite }) => {
    sqlite.exec('DROP TRIGGER enrolments_pair_insert_guard');
    sqlite.exec("INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('legacy-dup','student-a','class-other','withdrawn','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z')");
    sqlite.exec("INSERT INTO enrolments(id,student_id,class_id,status,enrolled_at,created_at,updated_at) VALUES ('legacy-dup-2','student-a','class-other','withdrawn','2026-09-02T00:00:00.000Z','2026-09-02T00:00:00.000Z','2026-09-02T00:00:00.000Z')");
    await expect(await post('admin-a', [{ kind: 'enrolment.transfer', enrolmentId: 'student-a-enrolment', expectedUpdatedAt: token(sqlite, 'enrolments', 'student-a-enrolment'), toClassId: 'class-other', effectiveOn: today }], { reason: 'Ambiguous target.' }), 409, 'ambiguous-legacy-pair', 'A transfer into a class holding duplicate legacy rows is refused, not guessed');
    await expect(await post('admin-a', [{ kind: 'enrolment.reenrol', enrolmentId: 'legacy-dup', expectedUpdatedAt: token(sqlite, 'enrolments', 'legacy-dup'), effectiveOn: today }], { reason: 'Ambiguous pair.' }), 409, 'ambiguous-legacy-pair', 'Re-enrolment of one of two duplicate rows is refused');
    check(row("SELECT count(*) n FROM enrolments WHERE student_id='student-a' AND class_id='class-other'").n, 2, 'Both legacy rows are preserved');
    check(row("SELECT status FROM enrolments WHERE id='student-a-enrolment'").status, 'active', 'The refused request changed nothing');
    // Legacy rows without lifecycle rows still report a start from their enrolled_at stamp, and nothing in the migration rewrote them.
    check(row("SELECT count(*) n FROM enrolment_lifecycle").n, 0, 'Migration created no lifecycle rows for existing enrolments');
    check(row("SELECT count(*) n FROM class_settings").n + row("SELECT count(*) n FROM course_lifecycle").n, 0, 'Migration created no settings or retired states for existing classes/courses');
  });

  await scenario('Migration 0018 applies over earlier data without altering it', async () => {
    const before = freshDatabase({ beforeMigration: '0018_course_class_enrolment_lifecycle.sql' }); await seedSecurityData(before.db, before.schema);
    const snapshot = tables => Object.fromEntries(tables.map(table => [table, before.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(found => ({ ...found }))]));
    const tables = ['schools', 'users', 'students', 'courses', 'classes', 'enrolments'];
    const original = snapshot(tables);
    const { readFileSync } = await import('node:fs'); const { join } = await import('node:path');
    const sql = readFileSync(join(new URL('../../', import.meta.url).pathname, 'drizzle', '0018_course_class_enrolment_lifecycle.sql'), 'utf8');
    before.sqlite.exec(sql.replaceAll('--> statement-breakpoint', ''));
    check(snapshot(tables), original, 'Every existing row is byte-identical after the migration');
    check(before.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name IN ('course_lifecycle','class_settings','enrolment_lifecycle','academic_change_requests','academic_events')").get().n, 5, 'The five new tables exist');
    check(before.sqlite.prepare("PRAGMA foreign_key_check").all().length, 0, 'No foreign key violation');
    before.sqlite.close();
  });
} finally { globalThis.fetch = oldFetch; }
check(networkCalls, 0, 'No external calls');
console.log(JSON.stringify({ passed, failed: 0, skipped: 0, scenarios, networkCalls }));
